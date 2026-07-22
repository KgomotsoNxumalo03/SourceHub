import "server-only";

import { env } from "@/lib/env";

export type AiProviderMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiProviderRequest = { system: string; messages: AiProviderMessage[]; model: string; maxOutputTokens: number };
export type AiProviderResult = { text: string; provider: string; modelIdentifier: string; inputTokens?: number; outputTokens?: number; latencyMs: number };

function developmentResponse(request: AiProviderRequest): AiProviderResult {
  const userMessage = request.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
  const sourceCount = (userMessage.match(/\[Source:/g) ?? []).length;
  const sourceText = sourceCount ? ` I found ${sourceCount} authorised source${sourceCount === 1 ? "" : "s"} in SourceHub.` : " I did not find an authorised SourceHub source for that request.";
  return { text: `Development AI adapter response: I can help with that request.${sourceText} This response is deterministic and is not a production model response.`, provider: "development-adapter", modelIdentifier: request.model, inputTokens: Math.ceil(userMessage.length / 4), outputTokens: 35, latencyMs: 0 };
}

function extractProviderText(payload: any) {
  const value = payload?.text ?? payload?.output_text ?? payload?.response ?? payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text;
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error("The configured AI provider returned no usable text.");
}

async function httpProvider(request: AiProviderRequest): Promise<AiProviderResult> {
  if (!env.AI_PROVIDER_URL || !env.AI_PROVIDER_API_KEY) throw new Error("AI_PROVIDER_URL and AI_PROVIDER_API_KEY must be configured for the HTTP provider.");
  const started = Date.now();
  const response = await fetch(env.AI_PROVIDER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_PROVIDER_API_KEY}` },
    body: JSON.stringify({ model: request.model, system: request.system, messages: request.messages, max_output_tokens: request.maxOutputTokens, temperature: 0.1 }),
    signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI provider request failed with status ${response.status}.`);
  const payload = await response.json();
  return { text: extractProviderText(payload), provider: "http", modelIdentifier: request.model, inputTokens: Number(payload?.usage?.prompt_tokens ?? 0) || undefined, outputTokens: Number(payload?.usage?.completion_tokens ?? 0) || undefined, latencyMs: Date.now() - started };
}

export async function completeAiRequest(request: AiProviderRequest) {
  if (!env.AI_ENABLED || env.AI_EMERGENCY_DISABLED) throw new Error("SourceHub AI is currently disabled by administration.");
  if (env.AI_PROVIDER === "dev") {
    if (process.env.NODE_ENV === "production") throw new Error("The development AI adapter cannot run in production.");
    return developmentResponse(request);
  }
  return httpProvider(request);
}
