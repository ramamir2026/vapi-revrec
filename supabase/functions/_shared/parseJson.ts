// Defensive parser for Claude responses.
// Claude occasionally wraps JSON in ```json fences or adds prose around it,
// even when instructed not to. This isolates the first valid JSON object.
export function extractJsonObject(text: string): { ok: true; value: any } | { ok: false; error: string; raw: string } {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "empty_response", raw: String(text ?? "") };
  }

  // 1. Strip markdown fences
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) s = fenceMatch[1].trim();

  // 2. Try direct parse first
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (_) { /* fall through */ }

  // 3. Find the first {...} balanced block
  const start = s.indexOf("{");
  if (start === -1) {
    return { ok: false, error: "no_json_object_found", raw: text };
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          return { ok: true, value: JSON.parse(candidate) };
        } catch (e) {
          return { ok: false, error: `parse_failed: ${(e as Error).message}`, raw: text };
        }
      }
    }
  }
  return { ok: false, error: "unbalanced_braces", raw: text };
}

// Pull text content out of an Anthropic messages response (handles thinking blocks)
export function extractTextFromAnthropicResponse(content: any[]): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}
