import type { PointerSourceError } from "../../foundation/json-pointer/pointerSource.js";
import {
  OK,
  type CapabilityResult,
  type DocumentCapabilitySourceResult,
} from "./capabilityResultTypes.js";

export function planDocumentCapabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;

  const out: Extract<CapabilityResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}

export function emptySelectionCapability(reason: string): CapabilityResult {
  return {
    ok: false,
    code: "empty_selection",
    reason,
  };
}

export function pointerSourceCapabilityError(
  error: PointerSourceError,
  label: string,
): DocumentCapabilitySourceResult {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", reason: `invalid ${label} source pointer: ${error.pointer}`, pointer: error.pointer }
    : { ok: false, code: "empty_selection", reason: `${label} source selection is empty` };
}
