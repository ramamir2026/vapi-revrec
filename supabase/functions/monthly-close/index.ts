import { corsHeaders } from "../_shared/cors.ts";
import { extractJsonObject, extractTextFromAnthropicResponse } from "../_shared/parseJson.ts";
import { requireVapiUser, serviceClient } from "../_shared/auth.ts";
import { callAnthropic, ConfigError, UpstreamError } from "../_shared/anthropic.ts";

const SYSTEM_PROMPT_BASE = await Deno.readTextFile(new URL("./system-prompt.md", import.meta.url));
const VAPI_POLICY = await Deno.readTextFile(new URL("./vapi-rev-rec-policy.md", import.meta.url));
const SYSTEM_PROMPT = `${SYSTEM_PROMPT_BASE}\n\n---\n\n# Reference: Vapi Revenue Recognition Policy (\`_reference/vapi-rev-rec-policy.md\`)\n\n${VAPI_POLICY}`;
const MODEL = "claude-sonnet-4-5";
const THINKING_BUDGET = 3000;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  const authResult = await requireVapiUser(req);
  if (!authResult.ok) return jsonResp({ error: authResult.error }, authResult.status);
  const { user } = authResult;

  let body: { contract_id?: string; period_year?: number; period_month?: number };
  try { body = await req.json(); } catch { return jsonResp({ error: "invalid_json_body" }, 400); }
  if (!body.contract_id || !body.period_year || !body.period_month) {
    return jsonResp({ error: "contract_id_period_year_period_month_required" }, 400);
  }

  const supa = serviceClient();

  const { data: contract, error: contractErr } = await supa
    .from("contracts")
    .select("*, customers!inner(id, customer_id, legal_name)")
    .eq("id", body.contract_id)
    .single();
  if (contractErr || !contract) return jsonResp({ error: "contract_not_found" }, 404);

  // Load supporting context
  const [{ data: pos }, { data: prior }, { data: usageRow }] = await Promise.all([
    supa.from("performance_obligations").select("*").eq("contract_id", body.contract_id),
    supa.from("revenue_schedule")
      .select("*")
      .eq("contract_id", body.contract_id)
      .order("period", { ascending: true }),
    supa.from("usage_uploads")
      .select("*")
      .eq("customer_pk", contract.customer_pk)
      .eq("period_year", body.period_year)
      .eq("period_month", body.period_month)
      .maybeSingle(),
  ]);

  if (!usageRow) {
    return jsonResp(
      { error: "usage_not_uploaded", message: "Upload the usage CSV for this period first." },
      400
    );
  }

  // Self Serve guard — this agent only handles Enterprise streams (straight_line + consumption).
  const cashPo = (pos ?? []).find((p: any) => p.treatment_basis === "cash");
  if (cashPo) {
    await supa.from("audit_log").insert({
      event_type: "monthly_close_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Refused close: cash-basis PO present (${cashPo.po_name}). Self Serve is out of scope.`,
      judgment_call: false,
      metadata: { period: `${body.period_year}-${body.period_month}`, refusal: "cash_basis_out_of_scope", po_id: cashPo.id },
    });
    return jsonResp(
      { error: "cash_basis_out_of_scope", message: "This contract contains a cash-basis (Self Serve) performance obligation. Self Serve recognition is handled in a separate Phase 2 workflow." },
      422
    );
  }

  // Server-side expected recognition per PO based on treatment_basis.
  // straight_line: transaction_price_allocated / contract_months
  // consumption: sum(actual_units × rate) from usage data (best-effort; Claude refines)
  const contractMonths = Math.max(
    1,
    contract.term_months ??
      (() => {
        const s = new Date(contract.effective_date);
        const e = new Date(contract.end_date);
        return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      })()
  );
  const usageRows: any[] = Array.isArray(usageRow.raw_data_json)
    ? usageRow.raw_data_json
    : Array.isArray((usageRow.raw_data_json as any)?.rows)
      ? (usageRow.raw_data_json as any).rows
      : [];
  const expectedPerPo = (pos ?? []).map((p: any) => {
    if (p.treatment_basis === "straight_line") {
      const amount = Number(p.transaction_price_allocated ?? 0) / contractMonths;
      return { po_id: p.id, po_name: p.po_name, treatment_basis: "straight_line", expected_amount: Number(amount.toFixed(2)), basis: `${p.transaction_price_allocated} / ${contractMonths}` };
    }
    if (p.treatment_basis === "consumption") {
      let units = 0;
      let rate = 0;
      for (const r of usageRows) {
        const u = Number(r.units ?? r.quantity ?? r.minutes ?? 0);
        const rt = Number(r.rate ?? r.unit_price ?? 0);
        units += isFinite(u) ? u : 0;
        if (isFinite(rt) && rt > 0) rate = rt;
      }
      const amount = units * rate;
      return { po_id: p.id, po_name: p.po_name, treatment_basis: "consumption", expected_amount: Number(amount.toFixed(2)), basis: `${units} units × ${rate}` };
    }
    return { po_id: p.id, po_name: p.po_name, treatment_basis: p.treatment_basis ?? null, expected_amount: null, basis: "unknown_treatment_basis" };
  });


  const userMessage = `Workflow: Monthly Close.

Customer ID: ${contract.customers.customer_id}
Customer legal name: ${contract.customers.legal_name}
Contract ID: ${body.contract_id}
Period: ${body.period_year}-${String(body.period_month).padStart(2, "0")}

Contract terms:
${JSON.stringify(
  {
    effective_date: contract.effective_date,
    end_date: contract.end_date,
    total_contract_value: contract.total_contract_value,
    billing_terms: contract.billing_terms,
    payment_terms: contract.payment_terms,
    has_minimum: contract.has_minimum,
    minimum_amount: contract.minimum_amount,
    has_ramp: contract.has_ramp,
    ramp_terms: contract.ramp_terms_json,
  },
  null,
  2
)}

Performance obligations:
${JSON.stringify(pos ?? [], null, 2)}

Prior revenue schedule (forecast and posted actuals):
${JSON.stringify(prior ?? [], null, 2)}

Raw usage data for this period:
${JSON.stringify(usageRow.raw_data_json, null, 2)}

Produce structured JSON output with keys: workflow, period, customer_id, usage_summary, recognized_amount_usd, recognized_breakdown[], variance_vs_forecast, monthly_je (with je_number_suggested, memo, lines[]), ndr_signals[], judgment_calls[], monthly_memo_markdown.`;

  let response;
  try {
    response = await callAnthropic({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      max_tokens: 6000,
      thinking_budget: THINKING_BUDGET,
    });
  } catch (e) {
    const isConfig = e instanceof ConfigError;
    const isUpstream = e instanceof UpstreamError;
    await supa.from("audit_log").insert({
      event_type: "monthly_close_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: `Monthly close failed: ${isConfig ? "config_error" : isUpstream ? (e as UpstreamError).code : "unknown"}`,
      judgment_call: false,
      claude_model: MODEL,
      metadata: {
        period: `${body.period_year}-${body.period_month}`,
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
      event_type: "monthly_close_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: "Monthly close returned but JSON parse failed",
      judgment_call: false,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      claude_input_tokens: response.usage.input_tokens,
      claude_output_tokens: response.usage.output_tokens,
      metadata: {
        period: `${body.period_year}-${body.period_month}`,
        parse_error: parsed.error,
        raw_excerpt: parsed.raw.slice(0, 2000),
      },
    });
    return jsonResp({ error: "parse_failed" }, 502);
  }

  const structured = parsed.value;

  if (structured?.needs_clarification) {
    await supa.from("audit_log").insert({
      event_type: "monthly_close_run",
      customer_pk: contract.customer_pk,
      contract_id: body.contract_id,
      user_id: user.id,
      action_summary: "Monthly close requested clarification",
      judgment_call: false,
      full_reasoning_text: fullReasoning,
      claude_model: MODEL,
      claude_input_tokens: response.usage.input_tokens,
      claude_output_tokens: response.usage.output_tokens,
      metadata: { period: `${body.period_year}-${body.period_month}`, needs_clarification: true },
    });
    return jsonResp({ status: "needs_clarification", structured });
  }

  // Insert NDR signals
  const lastDayOfMonth = new Date(body.period_year, body.period_month, 0).toISOString().slice(0, 10);
  const sigs = Array.isArray(structured.ndr_signals) ? structured.ndr_signals : [];
  for (const s of sigs) {
    await supa.from("ndr_signals").insert({
      customer_pk: contract.customer_pk,
      period: lastDayOfMonth,
      signal_type: s.signal_type,
      signal_strength: s.signal_strength,
      description: s.description ?? null,
    });
  }

  // Audit: overall close (no full reasoning unless judgment call) per spec
  await supa.from("audit_log").insert({
    event_type: "monthly_close_run",
    customer_pk: contract.customer_pk,
    contract_id: body.contract_id,
    user_id: user.id,
    action_summary: `Monthly close ${body.period_year}-${String(body.period_month).padStart(2, "0")} for ${contract.customers.customer_id}`,
    judgment_call: false,
    claude_model: MODEL,
    claude_input_tokens: response.usage.input_tokens,
    claude_output_tokens: response.usage.output_tokens,
    metadata: { period: `${body.period_year}-${body.period_month}` },
  });

  const jcs = Array.isArray(structured.judgment_calls) ? structured.judgment_calls : [];
  for (const jc of jcs) {
    await supa.from("audit_log").insert({
      event_type: "monthly_close_run",
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
      metadata: { period: `${body.period_year}-${body.period_month}`, rationale: jc.rationale ?? null },
    });
  }

  return jsonResp({ status: "ok", structured });
});
