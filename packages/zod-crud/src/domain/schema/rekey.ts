import { cloneJson, cloneTrustedJson } from "../../foundation/json.js";
import { collectSuffixExistingValues } from "./rekeySuffix.js";
import { scalarText, walk, walkSingleFieldText } from "./rekeyTraversal.js";
import type {
  RekeyContext,
  RekeyExecutionOptions,
  RekeyField,
  RekeyOptions,
  RekeyResult,
  RekeyStrategy,
} from "./rekeyTypes.js";

interface SuffixAttemptField extends RekeyField {
  nextAttempts: Map<string, number>;
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
  if (options.strategy === "suffix") {
    const payloadEntries: Array<Record<string, unknown>> = [];
    const existing = collectSuffixExistingValues(state, next, fields, payloadEntries);
    rekeyEntries(payloadEntries, existing, options.strategy);
    return next;
  }

  const existing = collectExistingValues(state, fields);
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
  if (fields.length === 0) return [];
  if (fields.length === 1) return [fields[0]!];
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
  walkSingleFieldText(value, field, (text) => existing.add(text));
}

function rekeyValue(
  value: unknown,
  fields: ReadonlyArray<RekeyField>,
  strategy: RekeyStrategy,
): void {
  if (fields.length === 1) {
    const { field, existing } = fields[0]!;
    const suffixAttempts = strategy === "suffix" ? new Map<string, number>() : null;
    walk(value, (entry) => {
      const current = entry[field];
      const currentText = scalarText(current);
      if (currentText === null) return;

      if (!existing.has(currentText)) {
        existing.add(currentText);
        return;
      }

      const next = suffixAttempts === null
        ? mintValue(current, { field, existing, attempt: 1 }, strategy)
        : mintSuffixValueWithCache(currentText, existing, field, suffixAttempts);
      entry[field] = next;
      existing.add(next);
    });
    return;
  }

  const suffixFields = strategy === "suffix" ? createSuffixAttemptFields(fields) : null;
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

      const next = suffixFields === null
        ? mintValue(current, { field, existing, attempt: 1 }, strategy)
        : mintSuffixValueWithCache(currentText, existing, field, suffixFields[index]!.nextAttempts);
      entry[field] = next;
      existing.add(next);
    }
  });
}

function rekeyEntries(
  entries: ReadonlyArray<Record<string, unknown>>,
  fields: ReadonlyArray<RekeyField>,
  strategy: RekeyStrategy,
): void {
  if (fields.length === 1) {
    const { field, existing } = fields[0]!;
    const suffixAttempts = strategy === "suffix" ? new Map<string, number>() : null;
    for (const entry of entries) {
      const current = entry[field];
      const currentText = scalarText(current);
      if (currentText === null) continue;

      if (!existing.has(currentText)) {
        existing.add(currentText);
        continue;
      }

      const next = suffixAttempts === null
        ? mintValue(current, { field, existing, attempt: 1 }, strategy)
        : mintSuffixValueWithCache(currentText, existing, field, suffixAttempts);
      entry[field] = next;
      existing.add(next);
    }
    return;
  }

  const suffixFields = strategy === "suffix" ? createSuffixAttemptFields(fields) : null;
  for (const entry of entries) {
    for (let index = 0; index < fields.length; index += 1) {
      const { field, existing } = fields[index]!;
      const current = entry[field];
      const currentText = scalarText(current);
      if (currentText === null) continue;

      if (!existing.has(currentText)) {
        existing.add(currentText);
        continue;
      }

      const next = suffixFields === null
        ? mintValue(current, { field, existing, attempt: 1 }, strategy)
        : mintSuffixValueWithCache(currentText, existing, field, suffixFields[index]!.nextAttempts);
      entry[field] = next;
      existing.add(next);
    }
  }
}

function createSuffixAttemptFields(fields: ReadonlyArray<RekeyField>): SuffixAttemptField[] {
  return fields.map((field) => ({
    field: field.field,
    existing: field.existing,
    nextAttempts: new Map(),
  }));
}

function mintValue(value: unknown, ctx: RekeyContext, strategy: RekeyStrategy): string {
  if (strategy === "suffix") return mintSuffixValue(String(value), ctx.existing, ctx.field);

  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const attemptCtx = { ...ctx, attempt };
    const next =
      typeof strategy === "function"
        ? strategy(value, attemptCtx)
        : randomId();
    if (!ctx.existing.has(next)) return next;
  }
  throw new Error(`could not mint unique value for ${ctx.field}`);
}

function mintSuffixValue(value: string, existing: ReadonlySet<string>, field: string): string {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const next = suffixValue(value, attempt);
    if (!existing.has(next)) return next;
  }
  throw new Error(`could not mint unique value for ${field}`);
}

function mintSuffixValueWithCache(
  value: string,
  existing: ReadonlySet<string>,
  field: string,
  nextAttempts: Map<string, number>,
): string {
  for (let attempt = nextAttempts.get(value) ?? 1; attempt < 10_000; attempt += 1) {
    const next = suffixValue(value, attempt);
    if (!existing.has(next)) {
      nextAttempts.set(value, attempt + 1);
      return next;
    }
  }
  throw new Error(`could not mint unique value for ${field}`);
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
