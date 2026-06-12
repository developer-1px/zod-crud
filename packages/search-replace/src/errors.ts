import type {
  JSONCapabilityResult,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

import type {
  SearchReplaceError,
  SearchReplaceErrorCode,
} from "./types.js";

export function capabilityError(
  root: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): SearchReplaceError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `text replacement patch rejected for ${root}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

export function patchError(
  root: Pointer,
  patch: Extract<JSONResult | JSONCapabilityResult, { ok: false }>,
): SearchReplaceError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `text replacement patch failed for ${root}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

export function searchReplaceError(
  code: SearchReplaceErrorCode,
  reason: string,
  pointer?: Pointer,
): SearchReplaceError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
