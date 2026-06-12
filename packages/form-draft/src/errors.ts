import type {
  JSONCapabilityResult,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

import type {
  FormDraftError,
} from "./types.js";

export function capabilityError(
  code: "value_rejected" | "commit_rejected",
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): FormDraftError {
  return {
    ok: false,
    code,
    reason: capability.reason ?? `${code}: ${pointer}`,
    pointer: capability.pointer ?? pointer,
    capability,
  };
}

export function commitFailed(
  pointer: Pointer,
  result: Exclude<JSONResult | JSONCapabilityResult, { ok: true }>,
): FormDraftError {
  return {
    ok: false,
    code: "commit_failed",
    reason: result.reason ?? `commit failed: ${pointer}`,
    pointer: result.pointer ?? pointer,
    result,
  };
}

export function missingDraft(pointer: Pointer): FormDraftError {
  return {
    ok: false,
    code: "missing_draft",
    reason: `draft not found: ${pointer}`,
    pointer,
  };
}

export function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): FormDraftError {
  return {
    ok: false,
    code,
    reason: reason ?? `field path not found: ${pointer}`,
    pointer,
  };
}
