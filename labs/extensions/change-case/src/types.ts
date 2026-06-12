import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type ChangeCaseErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_string"
  | "transform_failed"
  | "patch_rejected"
  | "patch_failed";

export interface ChangeCaseError {
  ok: false;
  code: ChangeCaseErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A named case/whitespace transform, or a host function over the current string. */
export type CaseTransform =
  | "upper"
  | "lower"
  | "trim"
  | "capitalize"
  | "title"
  | ((value: string) => string);

export interface ChangeCaseChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ChangeCaseResult = ChangeCaseChange | ChangeCaseError;

export interface ChangeCase<TDocument> {
  canTransform(pointer: Pointer, transform: CaseTransform): ChangeCaseResult;
  transform(pointer: Pointer, transform: CaseTransform): ChangeCaseResult;
}
