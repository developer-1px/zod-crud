import { cloneJson, cloneTrustedJson } from "../../foundation/json.js";

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

export interface RekeyExecutionOptions {
  trustedPayload?: boolean | undefined;
}

interface RekeyField {
  field: string;
  existing: Set<string>;
}

export function rekeyPayload(
  payload: unknown,
  state: unknown,
  options?: RekeyOptions,
  executionOptions: RekeyExecutionOptions = {},
): unknown {
  if (!options || options.fields.length === 0) return payload;

  const fields = uniqueFields(options.fields);
  if (fields.length === 0) return payload;

  const existing = collectExistingValues(state, fields);
  const next = executionOptions.trustedPayload ? cloneTrustedJson(payload) : cloneJson(payload);
  rekeyValue(next, existing, options.strategy);
  return next;
}

export function tryRekeyPayload(
  payload: unknown,
  state: unknown,
  options?: RekeyOptions,
  executionOptions?: RekeyExecutionOptions,
): RekeyResult {
  try {
    return { ok: true, payload: rekeyPayload(payload, state, options, executionOptions) };
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

function uniqueFields(fields: ReadonlyArray<string>): string[] {
  return [...new Set(fields)];
}

function collectExistingValues(value: unknown, fields: ReadonlyArray<string>): RekeyField[] {
  if (fields.length === 1) {
    const field = fields[0]!;
    const existing = new Set<string>();
    walk(value, (entry) => {
      const current = entry[field];
      if (isScalar(current)) existing.add(String(current));
    });
    return [{ field, existing }];
  }

  const existing = fields.map((field): RekeyField => ({ field, existing: new Set() }));

  walk(value, (entry) => {
    for (let index = 0; index < existing.length; index += 1) {
      const { field, existing: values } = existing[index]!;
      const value = entry[field];
      if (isScalar(value)) values.add(String(value));
    }
  });

  return existing;
}

function rekeyValue(
  value: unknown,
  fields: ReadonlyArray<RekeyField>,
  strategy: RekeyStrategy,
): void {
  if (fields.length === 1) {
    const { field, existing } = fields[0]!;
    walk(value, (entry) => {
      const current = entry[field];
      if (!isScalar(current)) return;

      const currentText = String(current);
      if (!existing.has(currentText)) {
        existing.add(currentText);
        return;
      }

      const next = mintValue(current, { field, existing, attempt: 1 }, strategy);
      entry[field] = next;
      existing.add(next);
    });
    return;
  }

  walk(value, (entry) => {
    for (let index = 0; index < fields.length; index += 1) {
      const { field, existing } = fields[index]!;
      const current = entry[field];
      if (!isScalar(current)) continue;

      const currentText = String(current);
      if (!existing.has(currentText)) {
        existing.add(currentText);
        continue;
      }

      const next = mintValue(current, { field, existing, attempt: 1 }, strategy);
      entry[field] = next;
      existing.add(next);
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

function walk(value: unknown, visit: (value: Record<string, unknown>) => void): void {
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
