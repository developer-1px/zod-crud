import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

export interface ProtectedRange {
  id: string;
  pointer: Pointer;
  label?: string;
}

export interface ProtectedRangeSummary extends ProtectedRange {}

export type ProtectedRangeErrorCode =
  | "invalid_pointer"
  | "protected_range"
  | "patch_rejected"
  | "patch_failed";

export type ProtectedRangeOperation =
  | "insert"
  | "replace"
  | "delete"
  | "move"
  | "patch"
  | "paste";

export interface ProtectedRangeError {
  ok: false;
  code: ProtectedRangeErrorCode;
  reason: string;
  operation?: ProtectedRangeOperation;
  pointer?: Pointer;
  range?: ProtectedRangeSummary;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type ProtectedRangeCapabilityResult =
  | JSONCapabilityResult
  | ProtectedRangeError;

export type ProtectedRangeEditResult =
  | JSONResult
  | JSONCapabilityResult
  | ProtectedRangeError;

export type ProtectedRangePasteResult<TDocument> =
  | ClipboardPasteResult<TDocument>
  | JSONCapabilityResult
  | ProtectedRangeError;

export interface ProtectedRanges<TDocument> {
  list(): ReadonlyArray<ProtectedRangeSummary>;
  isProtected(pointer: Pointer): ProtectedRangeCapabilityResult;
  canPatch(operations: JSONPatchInput): ProtectedRangeCapabilityResult;
  patch(operations: JSONPatchInput): ProtectedRangeEditResult;
  canInsert(path: Pointer, value: unknown): ProtectedRangeCapabilityResult;
  insert(path: Pointer, value: unknown): ProtectedRangeEditResult;
  canReplace(path: Pointer, value: unknown): ProtectedRangeCapabilityResult;
  replace(path: Pointer, value: unknown): ProtectedRangeEditResult;
  canDelete(path: Pointer): ProtectedRangeCapabilityResult;
  delete(path: Pointer): ProtectedRangeEditResult;
  canMove(source: Pointer, target: Pointer): ProtectedRangeCapabilityResult;
  move(source: Pointer, target: Pointer): ProtectedRangeEditResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ProtectedRangeCapabilityResult;
  paste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ProtectedRangePasteResult<TDocument>;
}
