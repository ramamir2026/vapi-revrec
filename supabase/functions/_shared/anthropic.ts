// Minimal Anthropic Messages API client (fetch-based; avoids npm SDK build surprises in Deno).
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "interleaved-thinking-2025-05-14";

export type AnthropicMessage = { role: "user" | "assistant"; content: string };

export interface AnthropicCallParams {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  thinking_budget?: number; // when > 0, enables extended thinking
}

export interface AnthropicResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string; thinking?: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new ConfigError(
      "ANTHROPIC_API_KEY is not configured. An admin must add it in backend secrets before analysis can run."
    );
  }

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens ?? 8000,
    system: params.system,
    messages: params.messages,
  };
  if (params.thinking_budget && params.thinking_budget > 0) {
    body.thinking = { type: "enabled", budget_tokens: params.thinking_budget };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": ANTHROPIC_BETA,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new UpstreamError(`anthropic_${res.status}`, errText);
  }
  return await res.json();
}

export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = "ConfigError"; }
}
export class UpstreamError extends Error {
  code: string;
  detail: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail.slice(0, 500)}`);
    this.name = "UpstreamError";
    this.code = code;
    this.detail = detail;
  }
}
