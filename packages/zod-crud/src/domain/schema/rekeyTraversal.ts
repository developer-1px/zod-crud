const hasOwn = Object.prototype.hasOwnProperty;

export function walk(value: unknown, visit: (value: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item !== null && typeof item === "object") walk(item, visit);
    }
    return;
  }
  if (isRecord(value)) {
    visit(value);
    for (const key in value) {
      if (hasOwn.call(value, key)) {
        const item = value[key];
        if (item !== null && typeof item === "object") walk(item, visit);
      }
    }
  }
}

export function walkSingleFieldText(
  value: unknown,
  field: string,
  visit: (text: string) => void,
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item !== null && typeof item === "object") {
        walkSingleFieldText(item, field, visit);
      }
    }
    return;
  }
  if (!isRecord(value)) return;

  const text = scalarText(value[field]);
  if (text !== null) visit(text);

  for (const key in value) {
    if (!hasOwn.call(value, key)) continue;
    const item = value[key];
    if (item !== null && typeof item === "object" && mayContainField(item, field)) {
      walkSingleFieldText(item, field, visit);
    }
  }
}

export function mayContainField(value: object, field: string): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!isRecord(value)) return false;
  if (hasOwn.call(value, field)) return true;
  for (const key in value) {
    if (!hasOwn.call(value, key)) continue;
    const child = value[key];
    if (child !== null && typeof child === "object") return true;
  }
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scalarText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
