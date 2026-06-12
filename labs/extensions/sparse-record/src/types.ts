import type { JSONCapabilityResult, JSONChangeMetadata, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type SparseRecordErrorCode =
  | "empty_edits"
  | "conflicting_entry"
  | "invalid_pointer"
  | "path_not_found"
  | "not_record"
  | "patch_rejected"
  | "patch_failed";

export interface SparseRecordError {
  ok: false;
  code: SparseRecordErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SparseRecordEdit {
  root: Pointer;
  set?: Readonly<Record<string, unknown>>;
  remove?: ReadonlyArray<string>;
}

export type SparseRecordAction = "add" | "replace" | "remove" | "noop";

export type SparseRecordIntent = "set" | "remove";

export interface SparseRecordDecision {
  root: Pointer;
  key: string;
  pointer: Pointer;
  intent: SparseRecordIntent;
  action: SparseRecordAction;
  current?: unknown;
  value?: unknown;
}

export interface SparseRecordEqualityContext {
  root: Pointer;
  key: string;
  pointer: Pointer;
}

export interface SparseRecordOptions {
  equals?: (current: unknown, next: unknown, context: SparseRecordEqualityContext) => boolean;
}

export interface SparseRecordChange {
  ok: true;
  changed: boolean;
  count: number;
  added: number;
  replaced: number;
  removed: number;
  unchanged: number;
  decisions: ReadonlyArray<SparseRecordDecision>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SparseRecordResult = SparseRecordChange | SparseRecordError;

export interface SparseRecord<TDocument> {
  canEdit(edits: SparseRecordEdit | ReadonlyArray<SparseRecordEdit>, options?: SparseRecordOptions): SparseRecordResult;
  edit(edits: SparseRecordEdit | ReadonlyArray<SparseRecordEdit>, options?: SparseRecordOptions, metadata?: JSONChangeMetadata): SparseRecordResult;
}
