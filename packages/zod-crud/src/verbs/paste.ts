// verbs/paste — Clipboard 기둥. payload + target/mode → RFC 6902 add patch.
// (schema, state, payload, target, mode) → { next, patch }.

import type * as z from "zod";
import type { JSONPatchOperation } from "../core/patch/index.js";
import { readAt, tryParsePointer, type Pointer } from "../core/pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "../core/schema/preFlight.js";
import { getDiscriminatedUnionInfo, getObjectLiteralValues, schemaAtPointer } from "../core/schema/introspection.js";
import { tryRekeyPayload, type RekeyOptions } from "../core/schema/rekey.js";

export type { RekeyContext, RekeyOptions, RekeyResult, RekeyStrategy } from "../core/schema/rekey.js";

export type PasteMode = "before" | "after" | "into" | "replace";
export type PasteTarget =
  | Pointer
  | { at: Pointer }
  | { before: Pointer }
  | { after: Pointer }
  | { replace: Pointer };

export interface PasteOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
}

export interface PasteError {
  ok: false;
  code: "empty_selection" | "not_serializable" | "rekey_failed" | PreFlightErrorCode;
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

export interface PastePayloadOptions {
  rekey?: RekeyOptions;
  /** Array payload 를 array target 에 여러 add op 로 펼친다. Multi-source clipboard paste 에 사용. */
  spread?: boolean;
}

export interface PasteOptions extends PastePayloadOptions {}

export interface ResolvedPasteArgs {
  target?: Pointer;
  mode: PasteMode;
  options: PastePayloadOptions;
}

export function resolvePasteArgs(
  target?: PasteTarget,
  options: PasteOptions = {},
): ResolvedPasteArgs {
  if (typeof target === "object" && target !== null) {
    if ("at" in target) return { target: target.at, mode: "into", options };
    if ("before" in target) return { target: target.before, mode: "before", options };
    if ("after" in target) return { target: target.after, mode: "after", options };
    if ("replace" in target) return { target: target.replace, mode: "replace", options };
    return { mode: "into", options };
  }
  return {
    ...(target !== undefined ? { target } : {}),
    mode: "into",
    options,
  };
}

export function paste<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  payload: unknown,
  target: Pointer,
  mode: PasteMode = "into",
  options: PastePayloadOptions = {},
): PasteOk<z.output<S>> | PasteError | PasteDuMismatch {
  const rekeyed = tryRekeyPayload(payload, state, options.rekey);
  if (!rekeyed.ok) return rekeyed;
  const nextPayload = rekeyed.payload;
  const spread = shouldSpread(nextPayload, state, target, mode, options);
  const mismatch = spread
    ? nextPayload.map((item) => findDuMismatch(schema, item, target, mode)).find((item): item is PasteDuMismatch => item !== null) ?? null
    : findDuMismatch(schema, nextPayload, target, mode);
  if (mismatch) return mismatch;

  const patch = spread ? buildSpreadPasteOps(nextPayload, target, mode) : [buildPasteOp(nextPayload, target, mode)];
  const r = preFlight(schema, state, patch);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch };
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

function shouldSpread(
  payload: unknown,
  state: unknown,
  target: Pointer,
  mode: PasteMode,
  options: PastePayloadOptions,
): payload is unknown[] {
  return options.spread === true
    && mode !== "replace"
    && Array.isArray(payload)
    && isArrayInsertionPath(state, insertionTarget(target, mode));
}

function buildSpreadPasteOps(payload: ReadonlyArray<unknown>, target: Pointer, mode: PasteMode): JSONPatchOperation[] {
  const path = insertionTarget(target, mode);
  return payload.map((value, index) => ({
    op: "add",
    path: offsetInsertionPath(path, index),
    value,
  }));
}

function insertionTarget(target: Pointer, mode: PasteMode): Pointer {
  if (mode !== "after") return target;
  const m = target.match(/^(.*\/)([0-9]+)$/);
  return m ? m[1] + String(Number(m[2]) + 1) : target;
}

function offsetInsertionPath(path: Pointer, offset: number): Pointer {
  if (offset === 0 || path.endsWith("/-")) return path;
  const m = path.match(/^(.*\/)([0-9]+)$/);
  return m ? m[1] + String(Number(m[2]) + offset) : path;
}

function isArrayInsertionPath(state: unknown, path: Pointer): boolean {
  const segments = tryParsePointer(path);
  if (segments === null || segments.length === 0) return false;

  const segment = segments[segments.length - 1]!;
  if (segment !== "-" && !/^(0|[1-9][0-9]*)$/.test(segment)) return false;

  const parent = readAt(state, segments.slice(0, -1));
  return parent.ok && Array.isArray(parent.value);
}
