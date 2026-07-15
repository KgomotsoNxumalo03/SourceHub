type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function serializeJsonValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

export function parseJsonValue(value: unknown): JsonValue | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    return value as JsonValue;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}
