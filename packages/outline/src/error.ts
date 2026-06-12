import type {
  Pointer,
} from "@interactive-os/json-document";

import type {
  OutlineEditError,
  OutlineEditErrorCode,
  OutlineError,
  OutlineErrorCode,
} from "./types.js";

export function outlineError(
  code: OutlineErrorCode,
  pointer: Pointer,
  reason?: string,
): OutlineError {
  return { ok: false, code, pointer, ...(reason === undefined ? {} : { reason }) };
}

export function editError(
  code: OutlineEditErrorCode,
  reason: string,
  pointer?: Pointer,
): OutlineEditError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
