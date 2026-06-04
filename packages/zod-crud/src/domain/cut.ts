// verbs/cut — Clipboard 기둥. copy ⊗ RFC 6902 remove ⊗ commit, atomic.
// (schema, state, source) → { next, patch, payload }.
// payload + remove 가 atomic. patchPreflight 거부 시 둘 다 안 일어남 — history 오염 0.

import type * as z from "zod";
import { jsonSerializableError } from "../foundation/json/serializable.js";
import { cloneTrustedPlainJson } from "../foundation/json/trustedClone.js";
import type { ApplyResult, JSONPatchOperation } from "../foundation/patch/types.js";
import { removeSourcesPatch } from "../foundation/patch/source.js";
import type { Pointer } from "../foundation/pointer/index.js";
import { readAt, tryParsePointer } from "../foundation/pointer/index.js";
import { patchPreflight, patchPreflightFromApplyResult, type PatchPreflightErrorCode } from "./schema/patch.js";
import type { ClipboardSource } from "./copy.js";

export interface CutOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  applied: ReadonlyArray<JSONPatchOperation>;
  payload: unknown;
  /** Primary source. Multi-source cut keeps the first selected source here for single-source compatibility. */
  source: Pointer;
  /** All cut sources, in caller/selection order. */
  sources: ReadonlyArray<Pointer>;
}

export interface CutError {
  ok: false;
  code: "empty_selection" | "invalid_pointer" | "path_not_found" | "not_serializable" | PatchPreflightErrorCode;
  reason: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

interface CutOptions {
  trusted?: boolean;
  clonePayload?: boolean;
  previewPatch?: ((operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<z.ZodTypeAny>) | undefined;
}

export function cut<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  source: ClipboardSource,
  options: CutOptions = {},
): CutOk<z.output<S>> | CutError {
  const removePlan = removeSourcesPatch(source);
  if (!removePlan.ok) {
    return removePlan.code === "invalid_pointer"
      ? cutError("invalid_pointer", `invalid cut source pointer: ${removePlan.pointer}`)
      : cutError("empty_selection", "cut source selection is empty");
  }

  const payloads: unknown[] = [];
  for (const item of removePlan.sources) {
    const r = readPayload(state, item, options);
    if (!r.ok) return r;
    payloads.push(r.payload);
  }
  const payload = typeof source === "string" ? payloads[0] : payloads;

  // 2) RFC 6902 remove patch 를 patchPreflight gate 통과시킨다.
  // 같은 array parent 의 index shift 를 피하려고 patch 적용 순서만 뒤에서 앞으로 정렬한다.
  const patch: JSONPatchOperation[] = removePlan.patch;
  const r = options.previewPatch
    ? patchPreflightFromApplyResult(options.previewPatch(patch))
    : patchPreflight(schema, state, patch);
  if (!r.ok) {
    return cutError(r.code, r.message, r.violations);
  }

  // 3) atomic — payload + next + patch 동시 산출
  return {
    ok: true,
    next: r.draft as z.output<S>,
    patch,
    applied: r.applied,
    payload,
    source: removePlan.source,
    sources: removePlan.sources,
  };
}

function readPayload(
  state: unknown,
  source: Pointer,
  options: CutOptions,
): { ok: true; payload: unknown } | CutError {
  const segments = tryParsePointer(source);
  if (segments === null) {
    return cutError("invalid_pointer", `invalid cut source pointer: ${source}`);
  }
  const v = readAt(state, segments);
  if (!v.ok) {
    return cutError("path_not_found", `cut source not found: ${source}`);
  }
  if (!options.trusted) {
    const jsonErr = jsonSerializableError(v.value);
    if (jsonErr) {
      return cutError("not_serializable", jsonErr);
    }
  }
  const payload = options.clonePayload === false ? v.value : cloneTrustedPlainJson(v.value);
  return { ok: true, payload };
}

function cutError(
  code: CutError["code"],
  reason: string,
  violations?: CutError["violations"],
): CutError {
  return violations === undefined
    ? { ok: false, code, reason }
    : { ok: false, code, reason, violations };
}
