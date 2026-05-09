export type EnumValueOption = string | number | boolean | null;

export function enumOptionDraft(value: EnumValueOption): string {
  return value === null ? "null" : String(value);
}

export function enumOptionLabel(value: EnumValueOption): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

export function enumOptionKey(value: EnumValueOption): string {
  return `${typeof value}:${enumOptionDraft(value)}`;
}

export function isEnumValueOption(value: unknown): value is EnumValueOption {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}
