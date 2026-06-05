import type {
  JSONCapabilityResult,
  JSONResult,
} from "zod-crud";

import type {
  BulkEditError,
} from "./types.js";

export function capabilityError(
  jsonPath: string,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): BulkEditError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `bulk edit patch rejected for ${jsonPath}`,
    jsonPath,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

export function patchError(
  jsonPath: string,
  patch: Extract<JSONResult, { ok: false }>,
): BulkEditError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `bulk edit patch failed for ${jsonPath}`,
    jsonPath,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}
