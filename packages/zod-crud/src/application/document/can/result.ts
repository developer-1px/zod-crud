import type { ErrorCode } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import type { PatchPreflightErrorCode } from "../../../domain/schema/patch.js";
import type { SelectionTextEditErrorCode } from "../../../domain/selection/textEdit.js";

export type CapabilityErrorCode =
  | ErrorCode
  | PatchPreflightErrorCode
  | SelectionTextEditErrorCode
  | "discriminator_mismatch"
  | "rekey_failed"
  | "missing_new_key"
  | "key_conflict"
  | "empty_selection"
  | "empty_scope"
  | "empty_match"
  | "cursor_boundary"
  | "syntax_error"
  | "empty_stack"
  | "apply_failed"
  | "empty_clipboard";

export interface CapabilityViolation {
  path: string;
  message: string;
}

export type CapabilityResult =
  | { ok: true }
  | {
      ok: false;
      code: CapabilityErrorCode;
      reason?: string;
      pointer?: Pointer;
      violations?: ReadonlyArray<CapabilityViolation>;
    };

export type DocumentCapabilitySourceResult =
  | { ok: true }
  | {
      ok: false;
      code: CapabilityErrorCode;
      message?: string;
      reason?: string;
      pointer?: Pointer | null;
      violations?: ReadonlyArray<CapabilityViolation>;
    };

export const OK: CapabilityResult = { ok: true };

export function capabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;
  const out: Extract<CapabilityResult, { ok: false }> = { ok: false, code: result.code };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}
