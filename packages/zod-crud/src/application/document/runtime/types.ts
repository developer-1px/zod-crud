import type { DuplicateError as DomainDuplicateError, DuplicateOpts } from "../../../domain/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../../domain/paste.js";
import type {
  SelectionContext,
  SelectionMode,
  SelectionRangeInput,
  SelectionSnap,
} from "../../../domain/selection/types.js";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import type { Pointer } from "../../../foundation/pointer/index.js";

export interface HistoryTransactionOptions {
  label?: string;
  origin?: "keyboard" | "pointer" | "programmatic" | string;
  mergeKey?: string;
}

export interface JSONChangeMetadata extends HistoryTransactionOptions {
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}

export type JSONPatchInput = JSONPatchOperation | ReadonlyArray<JSONPatchOperation>;

export interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  selection?: SelectionSnap;
}

export interface SelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}

export type JSONDocumentDuplicateOptions = DuplicateOpts;
export type JSONDocumentDuplicateError = DomainDuplicateError;
export type JSONDocumentDuplicateResult<T> =
  | {
      ok: true;
      value: T;
      applied: ReadonlyArray<JSONPatchOperation>;
      duplicatedTo: Pointer;
    }
  | JSONDocumentDuplicateError
  | Extract<JSONResult, { ok: false }>;

export type JSONDocumentPasteOptions = PasteOptions;
export type JSONDocumentPasteTarget = PasteTarget;

export interface JSONStateOps<T> {
  add(path: Pointer, value: unknown): JSONResult;
  remove(path: Pointer): JSONResult;
  replace(path: Pointer, value: unknown): JSONResult;
  move(from: Pointer, path: Pointer): JSONResult;
  copy(from: Pointer, path: Pointer): JSONResult;
  test(path: Pointer, value: unknown): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;

  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  readonly state: T;
}

export interface TrustedDocumentStateOps<T> extends JSONStateOps<T> {
  readonly lastApplied: ReadonlyArray<JSONPatchOperation>;
  readonly state: T;
  readonly stateJsonTrusted: boolean;
  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  previewPatch(operations: ReadonlyArray<JSONPatchOperation>): {
    result: JSONResult;
    state: T;
    applied: ReadonlyArray<JSONPatchOperation>;
  };
  previewTrustedValuesPatch(operations: ReadonlyArray<JSONPatchOperation>): {
    result: JSONResult;
    state: T;
    applied: ReadonlyArray<JSONPatchOperation>;
  };
  applyTrustedPatch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  trustedApply(state: T, applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
}

export interface DocumentPatchRuntimeState {
  lastPatch: ReadonlyArray<JSONPatchOperation>;
  documentSubscriberCount: number;
}

export interface SelectionRuntimeAccess {
  selectionEnabled: boolean;
  selectionMode: SelectionMode;
  snapSelection: () => SelectionSnap;
  restoreSelection: (selection: SelectionSnap) => void;
}
