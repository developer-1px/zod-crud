// verbs/cut — Clipboard 기둥. copy ⊗ RFC 6902 remove ⊗ commit, atomic.
// (schema, state, source) → { next, patch, payload }.
// payload + remove 가 atomic. preFlight 거부 시 둘 다 안 일어남 — history 오염 0.

import type * as z from "zod";
import { cloneJson, jsonSerializableError } from "../core/json.js";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { readAt, tryParsePointer } from "../core/pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "../core/schema/preFlight.js";

export interface CutOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  payload: unknown;
  source: Pointer;
}

export interface CutError {
  ok: false;
  code: "invalid_pointer" | "path_not_found" | "not_serializable" | PreFlightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export function cut<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  source: Pointer,
): CutOk<z.output<S>> | CutError {
  // 1) source 위치의 값을 payload 로 추출 (deep clone)
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

  // 2) RFC 6902 remove patch 를 preFlight gate 통과시킨다
  const op: JSONPatchOperation = { op: "remove", path: source };
  const r = preFlight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }

  // 3) atomic — payload + next + patch 동시 산출
  return { ok: true, next: r.draft, patch: [op], payload, source };
}
