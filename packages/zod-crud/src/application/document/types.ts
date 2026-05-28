import type { CapabilityResult } from "./can/result.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/patch/types.js";
import type { Pointer } from "../../foundation/pointer/index.js";
import type { SelectionSource } from "../../domain/selection/types.js";
import type { ClipboardState } from "./clipboard/types.js";
import type { EntriesResult, QueryResult, ReadResult } from "./read.js";
import type { SchemaState } from "./schema.js";
import type { SelectionState } from "./selection/create.js";
import type { JSONCrudError } from "../../foundation/error.js";
import type { JSONDocumentHistory } from "./history/types.js";
import type {
  JSONChangeMetadata,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateError,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  SelectionOptions,
} from "./runtime/types.js";

export type { JSONDocumentHistory } from "./history/types.js";
export type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateError,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  SelectionOptions,
} from "./runtime/types.js";

export interface JSONDocumentOptions {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
  /**
   * Treat `initial` as already-validated `z.output<S>`.
   * This skips the initial schema parse; use only when the caller owns that boundary.
   */
  trustedInitial?: boolean | undefined;
  history?: number;
  selection?: boolean | SelectionOptions;
  onChange?: () => void;
}
export type JSONCapabilityResult = CapabilityResult;

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly selection: SelectionState | undefined;
  readonly history: JSONDocumentHistory;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState;
  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
  canPatch(operations: JSONPatchInput): JSONCapabilityResult;
  canFind(jsonpath: string): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canRemove(source: SelectionSource): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source: SelectionSource): JSONCapabilityResult;
  canCut(source: SelectionSource): JSONCapabilityResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canPastePayload(target: JSONDocumentPasteTarget, payload: unknown, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}
