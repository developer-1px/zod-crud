import type { CapabilityResult } from "./can/result.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/patch/contract.js";
import type { Pointer } from "../../foundation/pointer/index.js";
import type { SelectionSource } from "../../domain/selection/read.js";
import type {
  ClipboardCopyOptions,
  ClipboardCopyResult,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardPasteResult,
  ClipboardState,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "./clipboard/contract.js";
import type { SchemaState } from "./schema/state.js";
import type { SelectionState, SelectionOptions } from "./selection/create.js";
import type { JSONCrudError } from "../../foundation/error.js";
import type {
  JSONChangeMetadata,
  JSONDocumentCommitOptions,
} from "./history/metadata.js";
import type { JSONDocumentHistory } from "./history/undoRedo.js";
import type {
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
} from "./edit/actions.js";
import type {
  EntriesResult,
  QueryResult,
  ReadResult,
} from "./read/read.js";
import type { JSONPatchInput } from "./state/patch.js";

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

type JSONDocumentEditError = Extract<JSONCapabilityResult, { ok: false }>;
type JSONDocumentEditResult = JSONResult | JSONDocumentEditError;

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly selection: SelectionState | undefined;
  readonly history: JSONDocumentHistory;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState;
  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  find(jsonpath: string): QueryResult;
  insert(path: Pointer, value: unknown): JSONDocumentEditResult;
  insert(value: unknown): JSONDocumentEditResult;
  replace(path: Pointer, value: unknown): JSONDocumentEditResult;
  replace(value: unknown): JSONDocumentEditResult;
  delete(source?: SelectionSource): JSONDocumentEditResult;
  move(source: Pointer, target: Pointer): JSONDocumentEditResult;
  move(target: Pointer): JSONDocumentEditResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  duplicate(options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  copy(source?: SelectionSource, options?: ClipboardCopyOptions): ClipboardCopyResult;
  cut(source?: SelectionSource, options?: ClipboardCutOptions): ClipboardCutResult<T>;
  paste(target?: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ClipboardPasteResult<T>;
  undo(): JSONCapabilityResult;
  redo(): JSONCapabilityResult;
  load(value: unknown, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: unknown): JSONResult;
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
  canInsert(value: unknown): JSONCapabilityResult;
  canInsert(path: Pointer, value: unknown): JSONCapabilityResult;
  canReplace(value: unknown): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canDelete(source?: SelectionSource): JSONCapabilityResult;
  canMove(target: Pointer): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canDuplicate(options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source?: SelectionSource): JSONCapabilityResult;
  canCut(source?: SelectionSource): JSONCapabilityResult;
  canPaste(target?: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}
