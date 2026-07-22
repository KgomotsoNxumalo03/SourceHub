const sensitiveKeys = /password|passwd|token|secret|private.?key|credential|api.?key|mfa|bank|identity.?number|compensation|salary|margin/i;
const secretPatterns = [
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi,
  /["']?(?:api[_ -]?key|secret|password|token|access[_ -]?token|bearer)["']?\s*[:=]\s*["']?[^\s,;"']+/gi,
  /\b(?:sk|ghp|xoxb|xoxp|AKIA)[_-][A-Za-z0-9_-]{8,}\b/g,
];

export function redactText(value: unknown) {
  let text = String(value ?? "");
  for (const pattern of secretPatterns) text = text.replace(pattern, "[REDACTED]");
  return text;
}

export function redactRecord(record: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (sensitiveKeys.test(key)) output[key] = "[REDACTED]";
    else if (typeof value === "string") output[key] = redactText(value).slice(0, 1200);
    else if (Array.isArray(value)) output[key] = value.slice(0, 30).map((item) => typeof item === "string" ? redactText(item).slice(0, 300) : item);
    else if (value && typeof value === "object") output[key] = redactRecord(value as Record<string, unknown>);
    else output[key] = value;
  }
  return output;
}

export function detectPromptInjection(value: string) {
  const patterns = [/ignore (?:all|any|the) previous instructions/i, /reveal (?:the )?(?:system|hidden) prompt/i, /override (?:your )?instructions/i, /call this tool/i, /send (?:me|to me) (?:the )?(?:secret|password|token)/i];
  return patterns.some((pattern) => pattern.test(value));
}

export function sourceDataEnvelope(sourceType: string, sourceId: string, content: unknown) {
  return `<source-data type="${sourceType}" id="${sourceId}">${redactText(JSON.stringify(content)).slice(0, 5000)}</source-data>`;
}
