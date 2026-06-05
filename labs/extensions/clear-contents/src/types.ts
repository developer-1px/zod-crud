import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type ClearContentsErrorCode =
  | "empty_target"
  | "schema_unavailable"
  | "cannot_derive_empty"
  | "patch_rejected"
  | "patch_failed";

export interface ClearContentsError {
  ok: false;
  code: ClearContentsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Minimal shape of `doc.schema.describe(pointer)` that this lab consumes. */
export interface SchemaDescription {
  kind: string;
  jsonSchema: unknown;
  allowed?: unknown[];
}

/** Host policy hook for kinds that cannot be cleared from schema alone. */
export type EmptyFor = (description: SchemaDescription, pointer: Pointer) => unknown;

export interface ClearContentsOptions {
  emptyFor?: EmptyFor;
}

export interface ClearContentsChange {
  ok: true;
  count: number;
  changed: boolean;
  /** Target write pointers, in input order. */
  pointers: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Same pointers, for hosts that keep selection after clearing. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type ClearContentsResult = ClearContentsChange | ClearContentsError;

export interface ClearContents<TDocument> {
  canClearContents(targets: ReadonlyArray<Pointer>, options?: ClearContentsOptions): ClearContentsResult;
  clearContents(targets: ReadonlyArray<Pointer>, options?: ClearContentsOptions): ClearContentsResult;
}
