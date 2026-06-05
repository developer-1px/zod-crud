import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type ConvertTypeErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_convertible"
  | "patch_rejected"
  | "patch_failed";

export interface ConvertTypeError {
  ok: false;
  code: ConvertTypeErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type ConvertTypeTarget = "string" | "number" | "integer" | "boolean";

export interface ConvertTypeChange {
  ok: true;
  pointer: Pointer;
  from: unknown;
  to: string | number | boolean;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ConvertTypeResult = ConvertTypeChange | ConvertTypeError;

export interface ConvertType<TDocument> {
  canConvertType(pointer: Pointer, to: ConvertTypeTarget): ConvertTypeResult;
  convertType(pointer: Pointer, to: ConvertTypeTarget): ConvertTypeResult;
}
