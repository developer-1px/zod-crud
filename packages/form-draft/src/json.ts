import type {
  SchemaKind,
} from "@interactive-os/json-document";

export function valueKind(value: unknown): SchemaKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

export function cloneJson<TValue>(value: TValue): TValue {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined as TValue;
  return JSON.parse(text) as TValue;
}
