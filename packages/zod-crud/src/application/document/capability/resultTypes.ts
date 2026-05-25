import type { ErrorCode } from "../../../foundation/json-patch/types.js";
import type { Pointer } from "../../../foundation/json-pointer/pointerCore.js";
import type { PatchPreflightErrorCode } from "../../../domain/schema/patchPreflight.js";
import type { SelectionTextEditErrorCode } from "../../../domain/selection/textEdit.js";

export type CapabilityErrorCode =
  | ErrorCode
  | PatchPreflightErrorCode
  | SelectionTextEditErrorCode
  | "du_branch_mismatch"
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
