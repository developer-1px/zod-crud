import type { CapabilityResult } from "./can/result.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/patch/types.js";
import type { Pointer } from "../../foundation/pointer/index.js";
import type { SelectionSource } from "../../domain/selection/types.js";
import type {
  ClipboardCopyOptions,
  ClipboardCopyResult,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardPasteResult,
  ClipboardState,
} from "./clipboard/types.js";
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

export type ReadResult =
  | { ok: true; path: Pointer; value: unknown }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };

export type QueryResult =
  | { ok: true; query: string; pointers: Pointer[] }
  | { ok: false; code: "invalid_query"; reason?: string };

export type EntryKind = "root" | "object" | "array" | "record" | "primitive";

export interface ReadEntry {
  key: string;
  path: Pointer;
  value: unknown;
}

export type EntriesResult =
  | {
      ok: true;
      path: Pointer;
      kind: EntryKind;
      entries: ReadonlyArray<ReadEntry>;
    }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };

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
