// verbs/cut — Clipboard 기둥. copy ⊗ RFC 6902 remove ⊗ commit, atomic.
// (schema, state, source) → { next, patch, payload }.
// payload + remove 가 atomic. preFlight 거부 시 둘 다 안 일어남 — history 오염 0.

import type * as z from "zod";
import { cloneJson, jsonSerializableError } from "../core/json.js";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { readAt, tryParsePointer } from "../core/pointer/index.js";
import { normalizePointerSources, type PointerSourceError } from "../core/pointer/sourceSet.js";
import { preFlight, type PreFlightErrorCode } from "../core/schema/preFlight.js";
import type { ClipboardSource } from "./copy.js";

export interface CutOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  payload: unknown;
  /** Primary source. Multi-source cut keeps the first selected source here for single-source compatibility. */
  source: Pointer;
  /** All cut sources, in caller/selection order. */
  sources: ReadonlyArray<Pointer>;
}

export interface CutError {
  ok: false;
  code: "empty_selection" | "invalid_pointer" | "path_not_found" | "not_serializable" | PreFlightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export function cut<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  source: ClipboardSource,
): CutOk<z.output<S>> | CutError {
  const sources = normalizeSources(source);
  if (!sources.ok) return sources;

  const payloads: unknown[] = [];
  for (const item of sources.sources) {
    const r = readPayload(state, item);
    if (!r.ok) return r;
    payloads.push(r.payload);
  }
  const payload = typeof source === "string" ? payloads[0] : payloads;

  // 2) RFC 6902 remove patch 를 preFlight gate 통과시킨다.
  // 같은 array parent 의 index shift 를 피하려고 patch 적용 순서만 뒤에서 앞으로 정렬한다.
  const patch: JSONPatchOperation[] = sortRemoveSources(sources.sources).map((path) => ({ op: "remove", path }));
  const r = preFlight(schema, state, patch);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }

  // 3) atomic — payload + next + patch 동시 산출
  return { ok: true, next: r.draft, patch, payload, source: sources.sources[0]!, sources: sources.sources };
}

function readPayload(state: unknown, source: Pointer): { ok: true; payload: unknown } | CutError {
  const segments = tryParsePointer(source);
  if (segments === null) {
    return { ok: false, code: "invalid_pointer", message: `invalid cut source pointer: ${source}` };
  }
  const v = readAt(state, segments);
  if (!v.ok) {
    return { ok: false, code: "path_not_found", message: `cut source not found: ${source}` };
  }
  const jsonErr = jsonSerializableError(v.value);
  if (jsonErr) {
    return { ok: false, code: "not_serializable", message: jsonErr };
  }
  const payload = cloneJson(v.value);
  return { ok: true, payload };
}

function normalizeSources(source: ClipboardSource): { ok: true; sources: Pointer[] } | CutError {
  const result = normalizePointerSources(source);
  return result.ok ? result : cutSourceError(result);
}

function cutSourceError(error: PointerSourceError): CutError {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", message: `invalid cut source pointer: ${error.pointer}` }
    : { ok: false, code: "empty_selection", message: "cut source selection is empty" };
}

function sortRemoveSources(sources: ReadonlyArray<Pointer>): Pointer[] {
  return [...sources].sort(compareRemoveSource);
}

function compareRemoveSource(left: Pointer, right: Pointer): number {
  const a = tryParsePointer(left) ?? [];
  const b = tryParsePointer(right) ?? [];
  if (a.length !== b.length) return b.length - a.length;

  if (sameParent(a, b)) {
    const ai = arrayIndex(a[a.length - 1]);
    const bi = arrayIndex(b[b.length - 1]);
    if (ai !== null && bi !== null && ai !== bi) return bi - ai;
  }

  return left < right ? 1 : left > right ? -1 : 0;
}

function sameParent(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length - 1; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function arrayIndex(segment: string | undefined): number | null {
  if (segment === undefined) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  const n = Number(segment);
  return Number.isSafeInteger(n) ? n : null;
}
