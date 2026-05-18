// verbs/paste — Clipboard 기둥. payload + target/mode → RFC 6902 add patch.
// (schema, state, payload, target, mode) → { next, patch }.
// hooks/useJSONDocument 가 selection 을 자동 주입 (ADR-0002 §0.5).

import type * as z from "zod";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { preFlight } from "../core/schema/preFlight.js";
import { getDiscriminatedUnionInfo, getObjectLiteralValues, schemaAtPointer } from "../core/schema/introspection.js";

export type PasteMode = "before" | "after" | "into" | "replace";

export interface PasteOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
}

export interface PasteError {
  ok: false;
  code: string;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export interface PasteDuMismatch {
  ok: false;
  code: "du_branch_mismatch";
  message: string;
  source: { discriminator: string; value: unknown };
  expected: { discriminator: string; allowed: unknown[] };
}

export interface PasteOptions {
  rekey?: RekeyOptions;
}

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

export function paste<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  payload: unknown,
  target: Pointer,
  mode: PasteMode = "into",
  options: PasteOptions = {},
): PasteOk<z.output<S>> | PasteError | PasteDuMismatch {
  const nextPayload = rekeyPayload(payload, state, options.rekey);
  const mismatch = findDuMismatch(schema, nextPayload, target, mode);
  if (mismatch) return mismatch;

  const op = buildPasteOp(nextPayload, target, mode);
  const r = preFlight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch: [op] };
}

function findDuMismatch<S extends z.ZodType>(
  schema: S,
  payload: unknown,
  target: Pointer,
  mode: PasteMode,
): PasteDuMismatch | null {
  const targetSchema = schemaAtPointer(schema, target, mode === "into" || mode === "before" || mode === "after" ? "insert" : "value");
  if (!targetSchema) return null;

  const info = getDiscriminatedUnionInfo(targetSchema);
  if (!isRecord(payload)) return null;

  if (!info) {
    return findLiteralMismatch(targetSchema, payload);
  }

  const value = payload[info.discriminator];
  if (info.allowed.some((allowed) => Object.is(allowed, value))) return null;

  return {
    ok: false,
    code: "du_branch_mismatch",
    message: `${String(value)} cannot be pasted where ${info.allowed.map(String).join(" | ")} is expected`,
    source: { discriminator: info.discriminator, value },
    expected: { discriminator: info.discriminator, allowed: info.allowed },
  };
}

function findLiteralMismatch(targetSchema: z.ZodType, payload: Record<string, unknown>): PasteDuMismatch | null {
  for (const key of Object.keys(payload)) {
    const allowed = getObjectLiteralValues(targetSchema, key);
    if (allowed.length === 0) continue;

    const value = payload[key];
    if (allowed.some((allowedValue) => Object.is(allowedValue, value))) return null;
    return {
      ok: false,
      code: "du_branch_mismatch",
      message: `${String(value)} cannot be pasted where ${allowed.map(String).join(" | ")} is expected`,
      source: { discriminator: key, value },
      expected: { discriminator: key, allowed },
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rekeyPayload(payload: unknown, state: unknown, options?: RekeyOptions): unknown {
  if (!options || options.fields.length === 0) return payload;

  const fieldSet = new Set(options.fields);
  const existing = collectExistingValues(state, fieldSet);
  const next = deepClone(payload);
  rekeyValue(next, fieldSet, existing, options.strategy);
  return next;
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
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return cryptoLike?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 12)}`;
}

function walk(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

function deepClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function buildPasteOp(payload: unknown, target: Pointer, mode: PasteMode): JSONPatchOperation {
  switch (mode) {
    case "replace":
      return { op: "replace", path: target, value: payload };
    case "before":
      return { op: "add", path: target, value: payload };
    case "after": {
      // /items/3 → /items/4. array index 만 안전하게 처리. object 는 사용자가 명시 path 권장.
      const m = target.match(/^(.*\/)([0-9]+)$/);
      if (m) {
        const next = String(Number(m[2]) + 1);
        return { op: "add", path: m[1] + next, value: payload };
      }
      return { op: "add", path: target, value: payload };
    }
    case "into":
    default:
      // collapsed selection / 빈 위치 — add 그대로. 배열의 `/-` 도 자연 처리.
      return { op: "add", path: target, value: payload };
  }
}
