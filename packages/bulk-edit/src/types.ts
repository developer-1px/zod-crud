import type {
  JSONCapabilityResult,
  JSONChangeMetadata,
  JSONPatchOperation,
  JSONResult,
  Pointer,
} from "zod-crud";

export type BulkEditErrorCode =
  | "invalid_query"
  | "empty_match"
  | "read_failed"
  | "mapper_failed"
  | "patch_rejected"
  | "patch_failed";

export interface BulkEditError {
  ok: false;
  code: BulkEditErrorCode;
  reason: string;
  jsonPath?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface BulkEditChange {
  ok: true;
  jsonPath: string;
  count: number;
  pointers: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type BulkEditChangeResult = BulkEditChange | BulkEditError;
export type BulkEditResult = BulkEditChange | BulkEditError;

export interface BulkEditMatch<TValue = unknown> {
  jsonPath: string;
  pointer: Pointer;
  value: TValue;
  index: number;
}

export type BulkEditValueMapper<TValue = unknown> = (
  match: BulkEditMatch<TValue>,
) => unknown;

export type BulkEditReplacementInput<TValue> = unknown | BulkEditValueMapper<TValue>;

export interface BulkEditCanReplaceAll {
  <TValue = unknown>(
    jsonPath: string,
    valueOrMapper: BulkEditValueMapper<TValue>,
  ): BulkEditChangeResult;
  (jsonPath: string, value: unknown): BulkEditChangeResult;
}

export interface BulkEditReplaceAll {
  <TValue = unknown>(
    jsonPath: string,
    valueOrMapper: BulkEditValueMapper<TValue>,
    metadata?: JSONChangeMetadata,
  ): BulkEditResult;
  (jsonPath: string, value: unknown, metadata?: JSONChangeMetadata): BulkEditResult;
}

export interface BulkEdit<TDocument> {
  canReplaceAll: BulkEditCanReplaceAll;
  replaceAll: BulkEditReplaceAll;
  canDeleteAll(jsonPath: string): BulkEditChangeResult;
  deleteAll(jsonPath: string, metadata?: JSONChangeMetadata): BulkEditResult;
}

export interface BulkEditReadOk<TValue> {
  ok: true;
  jsonPath: string;
  matches: ReadonlyArray<BulkEditMatch<TValue>>;
}

export type BulkEditReadResult<TValue> = BulkEditReadOk<TValue> | BulkEditError;
