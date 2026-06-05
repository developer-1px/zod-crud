// verbs/duplicate — Edit 기둥. in-place 형제 복제 (Q7 결정).
// (schema, state, source, opts?) → { next, patch }.
// 배열: 다음 인덱스로 자동. object: opts.newKey 명시 필수.
// 내부적으로 RFC 6902 copy op 으로 환원.

import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/patch/types.js";
import { parentPointer, lastSegment, lastSegmentIndex, withLastSegment, readAt, tryParsePointer } from "../../foundation/pointer/index.js";
import type { Pointer } from "../../foundation/pointer/index.js";
import { patchPreflight, patchPreflightFromApplyResult, type PatchPreflightErrorCode } from "../schema/patch.js";
import { tryRekeyPayload } from "../schema/rekey.js";
import type { RekeyOptions } from "../schema/rekey.js";

export interface DuplicateOpts {
  /** object key 복제 시 새 key. 배열에서는 무시됨. */
  newKey?: string;
  /** 복제 payload 안의 unique-like 필드 충돌을 새 값으로 바꾼다. 기본 off. */
  rekey?: RekeyOptions;
}

export interface DuplicateOk<T> {
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
    | PatchPreflightErrorCode;
  reason: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

interface ResolvedDuplicateArgs {
  source?: Pointer;
  opts: DuplicateOpts;
}

interface DuplicateExecutionOptions {
  previewPatch?: ((operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<z.ZodTypeAny>) | undefined;
  trustedPayload?: boolean;
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
  options: DuplicateExecutionOptions = {},
): DuplicateOk<z.output<S>> | DuplicateError {
  const parent = parentPointer(source);
  if (parent === null) {
    return duplicateError("invalid_pointer", "cannot duplicate root");
  }
  const parentSegs = tryParsePointer(parent);
  if (parentSegs === null) {
    return duplicateError("invalid_pointer", `invalid parent pointer: ${parent}`);
  }
  const parentRead = readAt(state, parentSegs);
  if (!parentRead.ok) {
    return duplicateError("path_not_found", `parent not found: ${parent}`);
  }

  let target: Pointer;
  if (Array.isArray(parentRead.value)) {
    // 배열: 다음 인덱스 (즉 source idx + 1)
    const idx = lastSegmentIndex(source);
    if (idx === null) {
      return duplicateError("invalid_pointer", `array source must have integer index: ${source}`);
    }
    const nextIdx = idx + 1;
    target = withLastSegment(source, nextIdx) ?? source;
  } else {
    // object: opts.newKey 필수
    if (!opts.newKey) {
      return duplicateError("missing_new_key", "object duplicate requires opts.newKey (배열은 자동, object 는 명시)");
    }
    target = withLastSegment(source, opts.newKey) ?? source;
    if (target === source) {
      return duplicateError("invalid_pointer", `cannot derive target from ${source}`);
    }
    // 충돌 체크 — newKey 가 이미 존재하면 거부
    if (Object.prototype.hasOwnProperty.call(parentRead.value as object, opts.newKey)) {
      return duplicateError("key_conflict", `newKey "${opts.newKey}" already exists at ${parent}`);
    }
  }

  const sourceSegs = tryParsePointer(source);
  if (sourceSegs === null) {
    return duplicateError("invalid_pointer", `invalid source pointer: ${source}`);
  }
  const sourceRead = readAt(state, sourceSegs);
  if (!sourceRead.ok) {
    return duplicateError("path_not_found", `source not found: ${source}`);
  }

  const rekeyed = tryRekeyPayload(sourceRead.value, state, opts.rekey, {
    trustedPayload: options.trustedPayload,
  });
  if (!rekeyed.ok) return rekeyed;
  const payload = rekeyed.payload;
  const op: JSONPatchOperation = opts.rekey ? { op: "add", path: target, value: payload } : { op: "copy", from: source, path: target };
  const r = options.previewPatch
    ? patchPreflightFromApplyResult(options.previewPatch([op]))
    : patchPreflight(schema, state, [op]);
  if (!r.ok) {
    return duplicateError(r.code, r.message, r.violations);
  }
  return { ok: true, next: r.draft as z.output<S>, patch: [op], duplicatedTo: target };
}

function duplicateError(
  code: DuplicateError["code"],
  reason: string,
  violations?: DuplicateError["violations"],
): DuplicateError {
  return violations === undefined
    ? { ok: false, code, reason }
    : { ok: false, code, reason, violations };
}

/** unused helper hint to silence linter for lastSegment import — also useful in error messages. */
void lastSegment;
