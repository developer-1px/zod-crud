import type {
  JSONCapabilityResult,
  JSONResult,
  Pointer,
} from "zod-crud";

import {
  cloneJson,
} from "./copy.js";
import type {
  ProposedChangeError,
  ProposedChangeErrorCode,
  ProposedChangeStatus,
} from "./types.js";

export function capabilityError(
  id: string | undefined,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ProposedChangeError {
  return proposedChangeError("patch_rejected", capability.reason ?? "proposed change patch rejected", {
    ...(id === undefined ? {} : { id }),
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

export function patchError(
  id: string,
  result: Exclude<JSONResult, { ok: true }>,
): ProposedChangeError {
  return proposedChangeError("patch_failed", result.reason ?? "proposed change patch failed", {
    id,
    ...(result.pointer === undefined ? {} : { pointer: result.pointer }),
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

export function notFound(id: string): ProposedChangeError {
  return proposedChangeError("not_found", `proposed change not found: ${id}`, { id });
}

export function notOpen(id: string, status: ProposedChangeStatus, action = "accept"): ProposedChangeError {
  return proposedChangeError("not_open", `cannot ${action} ${status} change: ${id}`, { id });
}

export function proposedChangeError(
  code: ProposedChangeErrorCode,
  reason: string,
  options: {
    id?: string;
    pointer?: Pointer;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): ProposedChangeError {
  return { ok: false, code, reason, ...(options.id === undefined ? {} : { id: options.id }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }), ...(options.capability === undefined ? {} : { capability: options.capability }), ...(options.result === undefined ? {} : { result: options.result }) };
}
