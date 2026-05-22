// verbs/duplicate — Edit 기둥. in-place 형제 복제 (Q7 결정).
// (schema, state, source, opts?) → { next, patch }.
// 배열: 다음 인덱스로 자동. object: opts.newKey 명시 필수.
// 내부적으로 RFC 6902 copy op 으로 환원.

import type * as z from "zod";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { parentPointer, lastSegment, lastSegmentIndex, withLastSegment, readAt, tryParsePointer } from "../../foundation/json-pointer/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "../schema/preFlight.js";
import { tryRekeyPayload, type RekeyOptions } from "../schema/rekey.js";

export interface DuplicateOpts {
  /** object key 복제 시 새 key. 배열에서는 무시됨. */
  newKey?: string;
  /** 복제 payload 안의 unique-like 필드 충돌을 새 값으로 바꾼다. 기본 off. */
  rekey?: RekeyOptions;
}

interface DuplicateOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  /** 복제 결과의 path. */
  duplicatedTo: Pointer;
}

export interface DuplicateError {
  ok: false;
  code:
    | "empty_selection"
    | "invalid_pointer"
    | "path_not_found"
    | "missing_new_key"
    | "key_conflict"
    | "not_serializable"
    | "rekey_failed"
    | PreFlightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

interface ResolvedDuplicateArgs {
  source?: Pointer;
  opts: DuplicateOpts;
}

export function resolveDuplicateArgs(
  sourceOrOpts?: Pointer | DuplicateOpts,
  opts: DuplicateOpts = {},
): ResolvedDuplicateArgs {
  return typeof sourceOrOpts === "string"
    ? { source: sourceOrOpts, opts }
    : { opts: sourceOrOpts ?? {} };
}

export function duplicate<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  source: Pointer,
  opts: DuplicateOpts = {},
): DuplicateOk<z.output<S>> | DuplicateError {
  const parent = parentPointer(source);
  if (parent === null) {
    return { ok: false, code: "invalid_pointer", message: "cannot duplicate root" };
  }
  const parentSegs = tryParsePointer(parent);
  if (parentSegs === null) {
    return { ok: false, code: "invalid_pointer", message: `invalid parent pointer: ${parent}` };
  }
  const parentRead = readAt(state, parentSegs);
  if (!parentRead.ok) {
    return { ok: false, code: "path_not_found", message: `parent not found: ${parent}` };
  }

  let target: Pointer;
  if (Array.isArray(parentRead.value)) {
    // 배열: 다음 인덱스 (즉 source idx + 1)
    const idx = lastSegmentIndex(source);
    if (idx === null) {
      return { ok: false, code: "invalid_pointer", message: `array source must have integer index: ${source}` };
    }
    const nextIdx = idx + 1;
    target = withLastSegment(source, nextIdx) ?? source;
  } else {
    // object: opts.newKey 필수
    if (!opts.newKey) {
      return {
        ok: false,
        code: "missing_new_key",
        message: "object duplicate requires opts.newKey (배열은 자동, object 는 명시)",
      };
    }
    target = withLastSegment(source, opts.newKey) ?? source;
    if (target === source) {
      return { ok: false, code: "invalid_pointer", message: `cannot derive target from ${source}` };
    }
    // 충돌 체크 — newKey 가 이미 존재하면 거부
    if (Object.prototype.hasOwnProperty.call(parentRead.value as object, opts.newKey)) {
      return { ok: false, code: "key_conflict", message: `newKey "${opts.newKey}" already exists at ${parent}` };
    }
  }

  const sourceSegs = tryParsePointer(source);
  if (sourceSegs === null) {
    return { ok: false, code: "invalid_pointer", message: `invalid source pointer: ${source}` };
  }
  const sourceRead = readAt(state, sourceSegs);
  if (!sourceRead.ok) {
    return { ok: false, code: "path_not_found", message: `source not found: ${source}` };
  }

  const rekeyed = tryRekeyPayload(sourceRead.value, state, opts.rekey);
  if (!rekeyed.ok) return rekeyed;
  const payload = rekeyed.payload;
  const op: JSONPatchOperation = opts.rekey ? { op: "add", path: target, value: payload } : { op: "copy", from: source, path: target };
  const r = preFlight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch: [op], duplicatedTo: target };
}

/** unused helper hint to silence linter for lastSegment import — also useful in error messages. */
void lastSegment;
