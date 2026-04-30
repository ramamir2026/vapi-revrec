import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { corsHeaders } from "../_shared/cors.ts";
import { extractJsonObject, extractTextFromAnthropicResponse } from "../_shared/parseJson.ts";
import { requireVapiUser, serviceClient } from "../_shared/auth.ts";
import { callAnthropic, ConfigError, UpstreamError } from "../_shared/anthropic.ts";

const SYSTEM_PROMPT = await Deno.readTextFile(new URL("./system-prompt.md", import.meta.url));
const MODEL = "claude-sonnet-4-5"; // claude-sonnet-4-6 alias not yet GA; use latest 4.x
const THINKING_BUDGET = 4000;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  // Auth
  const authResult = await requireVapiUser(req);
  if (!authResult.ok) return jsonResp({ error: authResult.error }, authResult.status);
  const { user } = authResult;

  let body: { contract_id?: string; mode?: "new_customer" | "amendment" };
  try { body = await req.json(); } catch { return jsonResp({ error: "invalid_json_body" }, 400); }
  if (!body.contract_id) return jsonResp({ error: "contract_id_required" }, 400);

  const supa = serviceClient();
  const mode = body.mode ?? "new_customer";

  // Load contract + customer
  const { data: contract, error: contractErr } = await supa
    .from("contracts")
    .select("*, customers!inner(id, customer_id, legal_name)")
    .eq("id", body.contract_id)
    .single();
  if (contractErr || !contract) return jsonResp({ error: "contract_not_found" }, 404);

  // Download MSA PDF and extract text
  let msaText = "";
  try {
    const { data: msaFile, error: dlErr } = await supa.storage
      .from("msas")
      .download(contract.msa_storage_path);
    if (dlErr || !msaFile) throw new Error(dlErr?.message ?? "msa_download_failed");
    const buf = new Uint8Array(await msaFile.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    msaText = String(text ?? "").trim();
    if (!msaText) throw new Error("empty_pdf_text");
  } catch (e) {
    await supa.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `MSA extraction failed for ${contract.customers.customer_id}`,
      judgment_call: false,
      metadata: { workflow: mode, extract_error: (e as Error).message },
    });
    return jsonResp({ error: "msa_extraction_failed", detail: (e as Error).message }, 422);
  }

  const userMessage = `Workflow: ${mode === "amendment" ? "Contract Amendment" : "New Customer Onboarding"}.

Customer ID: ${contract.customers.customer_id}
Customer legal name: ${contract.customers.legal_name}
Contract ID: ${body.contract_id}
Effective date: ${contract.effective_date}
End date: ${contract.end_date}

MSA text:
---
${msaText}
---

Apply the 5-step ASC 606 model. Produce structured JSON output with the following keys:
- contract_summary
- step_1_contract_identification
- performance_obligations[]
- transaction_price
- allocation
- recognition_pattern
- revenue_schedule[]
- day_one_je
- judgment_calls[]
- analysis_memo_markdown

Each element of judgment_calls[] should have: decision, alternative, rationale, asc606_citation, judgment_call: true.
Routine decisions should NOT be in judgment_calls but should be reflected in analysis_memo_markdown.`;

  // Call Anthropic
  let response;
  try {
    response = await callAnthropic({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 8000,
      thinking_budget: THINKING_BUDGET,
    });
  } catch (e) {
    const isConfig = e instanceof ConfigError;
    const isUpstream = e instanceof UpstreamError;
    await supa.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Analysis failed: ${isConfig ? "config_error" : isUpstream ? (e as UpstreamError).code : "unknown_error"}`,
      judgment_call: false,
      claude_model: MODEL,
      metadata: {
        workflow: mode,
        upstream_error: isUpstream ? (e as UpstreamError).detail : null,
        config_error: isConfig ? (e as Error).message : null,
        message: (e as Error).message,
      },
    });
    return jsonResp(
      {
        error: isConfig ? "ai_not_configured" : "upstream_error",
        message: isConfig
          ? "The AI engine isn't configured yet. An admin needs to add the ANTHROPIC_API_KEY in backend secrets."
          : "The AI engine returned an error. The audit log has the details.",
      },
      isConfig ? 503 : 502
    );
  }

  const fullReasoning = JSON.stringify(response.content, null, 2);
  const rawText = extractTextFromAnthropicResponse(response.content);
  const parsed = extractJsonObject(rawText);

  if (!parsed.ok) {
    await supa.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Analysis returned but JSON parse failed`,
      judgment_call: false,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      claude_input_tokens: response.usage.input_tokens,
      claude_output_tokens: response.usage.output_tokens,
      metadata: { workflow: mode, parse_error: parsed.error, raw_excerpt: parsed.raw.slice(0, 2000) },
    });
    return jsonResp(
      { error: "parse_failed", message: "The AI response couldn't be parsed. The raw response is in the audit log." },
      502
    );
  }

  const structured = parsed.value;

  // Handle clarification request
  if (structured?.needs_clarification) {
    await supa.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Analysis requested clarification`,
      judgment_call: false,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      claude_input_tokens: response.usage.input_tokens,
      claude_output_tokens: response.usage.output_tokens,
      metadata: { workflow: mode, needs_clarification: true, questions: structured.questions ?? [] },
    });
    return jsonResp({ status: "needs_clarification", structured });
  }

  // Persist contract summary fields back onto the contract row
  try {
    const cs = structured.contract_summary ?? {};
    await supa.from("contracts").update({
      total_contract_value: cs.total_contract_value_usd ?? null,
      billing_terms: cs.billing_terms ?? null,
      payment_terms: cs.payment_terms ?? null,
      has_minimum: !!cs.has_minimum,
      minimum_amount: cs.minimum_amount_usd ?? null,
      has_ramp: !!cs.has_ramp,
      ramp_terms_json: cs.ramp_terms ?? null,
    }).eq("id", body.contract_id);

    // Insert performance obligations (replace any existing for this contract)
    await supa.from("performance_obligations").delete().eq("contract_id", body.contract_id);
    const pos = Array.isArray(structured.performance_obligations) ? structured.performance_obligations : [];
    const poRows: any[] = [];
    for (const po of pos) {
      const { data: inserted } = await supa.from("performance_obligations").insert({
        contract_id: body.contract_id,
        po_name: po.po_name,
        description: po.description ?? null,
        is_distinct: !!po.is_distinct,
        is_series: !!po.is_series,
        recognition_pattern: po.recognition_pattern,
        transaction_price_allocated: po.transaction_price_allocated ?? null,
        recognition_basis: po.recognition_basis ?? null,
        asc606_citation: po.asc606_citation ?? null,
        variable_consideration_treatment: po.variable_consideration_treatment ?? null,
      }).select().single();
      if (inserted) poRows.push(inserted);
    }

    // Insert revenue schedule (forecast)
    const sched = Array.isArray(structured.revenue_schedule) ? structured.revenue_schedule : [];
    if (poRows.length > 0) {
      await supa.from("revenue_schedule").delete().eq("contract_id", body.contract_id).eq("status", "forecast");
      const defaultPo = poRows[0];
      for (const row of sched) {
        // best-effort match by po_name; fall back to first PO
        const match = poRows.find((p) => p.po_name === row.performance_obligation) ?? defaultPo;
        await supa.from("revenue_schedule").insert({
          contract_id: body.contract_id,
          performance_obligation_id: match.id,
          period: row.period,
          forecast_amount: row.forecast_amount_usd ?? 0,
          forecast_basis: row.forecast_basis ?? row.notes ?? null,
          status: "forecast",
        });
      }
    }
  } catch (e) {
    // Persistence failure shouldn't lose the analysis — log and return structured anyway
    await supa.from("audit_log").insert({
      event_type: "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Analysis persisted partially: ${(e as Error).message}`,
      judgment_call: false,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      metadata: { workflow: mode, persist_error: (e as Error).message },
    });
  }

  // Audit: overall analysis run (always full reasoning per spec)
  await supa.from("audit_log").insert({
    event_type: mode === "amendment" ? "amendment_added" : "analysis_run",
    customer_pk: contract.customer_pk,
    contract_id: body.contract_id,
    user_id: user.id,
    action_summary: `${mode === "amendment" ? "Amendment" : "Initial"} ASC 606 analysis run for ${contract.customers.customer_id}`,
    judgment_call: false,
    full_reasoning_text: fullReasoning,
    claude_model: MODEL,
    claude_input_tokens: response.usage.input_tokens,
    claude_output_tokens: response.usage.output_tokens,
    metadata: { workflow: mode },
  });

  // One row per judgment call
  const jcs = Array.isArray(structured.judgment_calls) ? structured.judgment_calls : [];
  for (const jc of jcs) {
    await supa.from("audit_log").insert({
      event_type: mode === "amendment" ? "amendment_added" : "analysis_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: jc.decision ?? "Judgment call",
      decision_made: jc.decision ?? null,
      alternative_considered: jc.alternative ?? null,
      asc606_citation: jc.asc606_citation ?? null,
      judgment_call: true,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      metadata: { workflow: mode, rationale: jc.rationale ?? null },
    });
  }

  return jsonResp({ status: "ok", structured });
});
