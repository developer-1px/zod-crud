import { cloneJson } from "../../foundation/json.js";

export type RekeyStrategy = "suffix" | "uuid" | ((value: unknown, ctx: RekeyContext) => string);

export interface RekeyContext {
  field: string;
  existing: ReadonlySet<string>;
  attempt: number;
}

export interface RekeyOptions {
  fields: string[];
  strategy: RekeyStrategy;
}

export type RekeyErrorCode = "not_serializable" | "rekey_failed";
export type RekeyResult = { ok: true; payload: unknown } | { ok: false; code: RekeyErrorCode; message: string };

export function rekeyPayload(payload: unknown, state: unknown, options?: RekeyOptions): unknown {
  if (!options || options.fields.length === 0) return payload;

  const fieldSet = new Set(options.fields);
  const existing = collectExistingValues(state, fieldSet);
  const next = cloneJson(payload);
  rekeyValue(next, fieldSet, existing, options.strategy);
  return next;
}

export function tryRekeyPayload(payload: unknown, state: unknown, options?: RekeyOptions): RekeyResult {
  try {
    return { ok: true, payload: rekeyPayload(payload, state, options) };
  } catch (error) {
    return rekeyError(error);
  }
}

function rekeyError(error: unknown): RekeyResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    code: message.startsWith("Value is not JSON-serializable") ? "not_serializable" : "rekey_failed",
    message,
  };
}

function collectExistingValues(value: unknown, fields: ReadonlySet<string>): Map<string, Set<string>> {
  const existing = new Map<string, Set<string>>();
  for (const field of fields) existing.set(field, new Set());

  walk(value, (entry) => {
    if (!isRecord(entry)) return;
    for (const field of fields) {
      const value = entry[field];
      if (isScalar(value)) existing.get(field)?.add(String(value));
    }
  });

  return existing;
}

function rekeyValue(
  value: unknown,
  fields: ReadonlySet<string>,
  existing: Map<string, Set<string>>,
  strategy: RekeyStrategy,
): void {
  walk(value, (entry) => {
    if (!isRecord(entry)) return;
    for (const field of fields) {
      const current = entry[field];
      if (!isScalar(current)) continue;

      const seen = existing.get(field);
      if (!seen) continue;
      const currentText = String(current);
      if (!seen.has(currentText)) {
        seen.add(currentText);
        continue;
      }

      const next = mintValue(current, { field, existing: seen, attempt: 1 }, strategy);
      entry[field] = next;
      seen.add(next);
    }
  });
}

function mintValue(value: unknown, ctx: RekeyContext, strategy: RekeyStrategy): string {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const attemptCtx = { ...ctx, attempt };
    const next =
      typeof strategy === "function"
        ? strategy(value, attemptCtx)
        : strategy === "uuid"
          ? randomId()
          : suffixValue(String(value), attempt);
    if (!ctx.existing.has(next)) return next;
  }
  throw new Error(`could not mint unique value for ${ctx.field}`);
}

function suffixValue(value: string, attempt: number): string {
  return attempt === 1 ? `${value}-copy` : `${value}-copy-${attempt}`;
}

function randomId(): string {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array } | undefined;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  if (!cryptoLike?.getRandomValues) throw new Error("crypto.getRandomValues is required for uuid rekey strategy");

  const bytes = cryptoLike.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function walk(value: unknown, visit: (value: unknown) => void): void {
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
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const item = value[key];
        if (item !== null && typeof item === "object") walk(item, visit);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
