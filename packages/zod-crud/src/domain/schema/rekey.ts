import { cloneJson, cloneTrustedJson } from "../../foundation/json.js";

const hasOwn = Object.prototype.hasOwnProperty;
const COPY_SUFFIX = "-copy";
const COPY_NESTED_SUFFIX = "-copy-";

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

interface SuffixRekeyField extends RekeyField {
  bases: Set<string>;
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

  const next = executionOptions.trustedPayload ? cloneTrustedJson(payload) : cloneJson(payload);
  const existing = options.strategy === "suffix"
    ? collectSuffixExistingValues(state, next, fields)
    : collectExistingValues(state, fields);
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
    collectSingleExistingField(value, field, existing);
    return [{ field, existing }];
  }

  const existing = fields.map((field): RekeyField => ({ field, existing: new Set() }));

  walk(value, (entry) => {
    for (let index = 0; index < existing.length; index += 1) {
      const { field, existing: values } = existing[index]!;
      const value = scalarText(entry[field]);
      if (value !== null) values.add(value);
    }
  });

  return existing;
}

function collectSingleExistingField(value: unknown, field: string, existing: Set<string>): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item !== null && typeof item === "object") {
        collectSingleExistingField(item, field, existing);
      }
    }
    return;
  }
  if (!isRecord(value)) return;

  const current = scalarText(value[field]);
  if (current !== null) existing.add(current);

  for (const key in value) {
    if (!hasOwn.call(value, key)) continue;
    const item = value[key];
    if (item !== null && typeof item === "object") {
      collectSingleExistingField(item, field, existing);
    }
  }
}

function collectSuffixExistingValues(
  state: unknown,
  payload: unknown,
  fields: ReadonlyArray<string>,
): RekeyField[] {
  const suffixFields = fields.map((field): SuffixRekeyField => ({
    field,
    existing: new Set(),
    bases: new Set(),
  }));

  walk(payload, (entry) => {
    for (let index = 0; index < suffixFields.length; index += 1) {
      const { field, bases } = suffixFields[index]!;
      const current = scalarText(entry[field]);
      if (current !== null) bases.add(current);
    }
  });

  let hasBases = false;
  for (const field of suffixFields) {
    if (field.bases.size === 0) continue;
    hasBases = true;
  }
  if (!hasBases) return suffixFields;

  if (suffixFields.length === 1) {
    const suffixField = suffixFields[0]!;
    if (suffixField.bases.size === 1) {
      collectSingleSuffixField(state, suffixField);
      return suffixFields;
    }
    walk(state, (entry) => {
      const text = scalarText(entry[suffixField.field]);
      if (text === null) return;
      if (matchesSuffixCandidate(text, suffixField)) suffixField.existing.add(text);
    });
    return suffixFields;
  }

  walk(state, (entry) => {
    for (let index = 0; index < suffixFields.length; index += 1) {
      const suffixField = suffixFields[index]!;
      const text = scalarText(entry[suffixField.field]);
      if (text === null) continue;
      if (matchesSuffixCandidate(text, suffixField)) suffixField.existing.add(text);
    }
  });

  return suffixFields;
}

function collectSingleSuffixField(state: unknown, suffixField: SuffixRekeyField): void {
  const base = suffixField.bases.values().next().value as string;
  const exact = `${base}-copy`;
  const nested = `${exact}-`;
  scanSingleSuffixField(state, suffixField.field, suffixField.existing, base, exact, nested);
}

function scanSingleSuffixField(
  value: unknown,
  field: string,
  existing: Set<string>,
  base: string,
  exact: string,
  nested: string,
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item !== null && typeof item === "object") {
        scanSingleSuffixField(item, field, existing, base, exact, nested);
      }
    }
    return;
  }
  if (!isRecord(value)) return;

  const text = scalarText(value[field]);
  if (text !== null && (text === base || text === exact || text.startsWith(nested))) {
    existing.add(text);
  }

  for (const key in value) {
    if (!hasOwn.call(value, key)) continue;
    const item = value[key];
    if (item !== null && typeof item === "object") {
      scanSingleSuffixField(item, field, existing, base, exact, nested);
    }
  }
}

function matchesSuffixCandidate(value: string, field: SuffixRekeyField): boolean {
  if (field.bases.has(value)) return true;

  if (
    value.endsWith(COPY_SUFFIX)
    && field.bases.has(value.slice(0, -COPY_SUFFIX.length))
  ) {
    return true;
  }

  let marker = value.indexOf(COPY_NESTED_SUFFIX);
  while (marker !== -1) {
    if (field.bases.has(value.slice(0, marker))) return true;
    marker = value.indexOf(COPY_NESTED_SUFFIX, marker + 1);
  }
  return false;
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
      const currentText = scalarText(current);
      if (currentText === null) return;

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
      const currentText = scalarText(current);
      if (currentText === null) continue;

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
      if (hasOwn.call(value, key)) {
        const item = value[key];
        if (item !== null && typeof item === "object") walk(item, visit);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
