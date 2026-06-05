import type { JSONCapabilityResult, JSONChangeMetadata, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type DocumentDiffErrorCode =
  | "patch_rejected"
  | "patch_failed";

export interface DocumentDiffError {
  ok: false;
  code: DocumentDiffErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface DocumentDiffChange<TValue = unknown> {
  ok: true;
  changed: boolean;
  value: TValue;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type DocumentDiffChangeResult<TValue = unknown> =
  | DocumentDiffChange<TValue>
  | DocumentDiffError;

export type DocumentDiffApplyResult<TValue = unknown> =
  | DocumentDiffChange<TValue>
  | DocumentDiffError;

export interface DocumentDiff<TDocument> {
  diff<TValue = unknown>(target: TValue): DocumentDiffChangeResult<TValue>;
  canApply<TValue = unknown>(target: TValue): DocumentDiffChangeResult<TValue>;
  apply<TValue = unknown>(target: TValue, metadata?: JSONChangeMetadata): DocumentDiffApplyResult<TValue>;
}
