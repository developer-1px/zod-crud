import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type IncrementNumberErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_number"
  | "patch_rejected"
  | "patch_failed";

export interface IncrementNumberError {
  ok: false;
  code: IncrementNumberErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface IncrementNumberOptions {
  /** Amount to add (default 1). Use a negative step or `decrement` to go down. */
  step?: number;
  /** Clamp the result to at least this value. */
  min?: number;
  /** Clamp the result to at most this value. */
  max?: number;
}

export interface IncrementNumberChange {
  ok: true;
  pointer: Pointer;
  from: number;
  to: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type IncrementNumberResult = IncrementNumberChange | IncrementNumberError;

export interface IncrementNumber<TDocument> {
  canStep(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  step(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  increment(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  decrement(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
}
