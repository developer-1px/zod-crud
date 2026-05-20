// Headless JSONDocument facade.
// React 의존 없이 useJSONDocument 와 같은 편집 표면을 제공한다.

import type * as z from "zod";

import { buildCan, type Can } from "./commands/buildCan.js";
import { buildCommands, type Commands } from "./commands/buildCommands.js";
import { buildCheck, type Check } from "./check.js";
import {
  applyPatch,
  computeInverses,
  type JSONPatchOperation,
  type JSONResult,
} from "./core/patch/index.js";
import { parsePointer, readAt, type Pointer } from "./core/pointer/index.js";
import {
  reduceSelection,
  restoreSelection,
  type SelectionAction,
  type SelectionMode,
  type SelectionSnap,
} from "./core/selection/index.js";
import {
  back as historyBack,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  commit as historyCommit,
  emptyHistory,
  forward as historyForward,
  mergeLast as historyMergeLast,
  type HistoryStack,
} from "./core/history.js";
import { JSONCrudError } from "./JSONCrudError.js";
import { createClipboardState, type ClipboardState } from "./clipboard.js";
import { createJSON } from "./createJSON.js";
import { buildReadFacade, type EntriesResult, type QueryResult, type ReadResult } from "./read.js";
import { createSchemaState, type SchemaState } from "./schema.js";
import { createSelection, type SelectionState, type UseSelectionOptions } from "./selection.js";
import type {
  HistoryMergeOptions,
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONDocumentOps,
  JSONLoadOptions,
  JSONOps,
  UseJSONOptions,
} from "./jsonOps.js";

export interface UseJSONDocumentOptions<T> extends UseJSONOptions {
  history?: number;
  selection?: boolean | UseSelectionOptions;
  onChange?: () => void;
}

export interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  mergeLast(options?: HistoryMergeOptions): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

export type JSONDocumentCommitSelection = SelectionAction | SelectionSnap;

export interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  /**
   * Final model selection for this edit. When present, it overrides mutation
   * auto-selection and is recorded in the same history entry as the patch.
   */
  selection?: JSONDocumentCommitSelection;
}

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly selection: SelectionState<T> | undefined;
  readonly history: JSONDocumentHistory;
  readonly ops: JSONDocumentOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState<T>;
  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}

interface HistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
}

export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions<z.output<S>> = {},
): JSONDocument<z.output<S>> {
  const json = createJSON(schema, initial, options);
  const rawOps = json.ops;
  const historyLimit = options.history ?? 0;
  let stack: HistoryStack<HistoryEntry> = emptyHistory<HistoryEntry>();
  let isRestoring = false;
  let activeHistoryMetadata: HistoryTransactionOptions | undefined;
  let lastPatch: JSONPatchOperation[] = [];

  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof options.selection === "object" ? options.selection : {};
  const selectionMode = selectionOptions.mode ?? "single";

  const createSelectionOptions: UseSelectionOptions & {
    onChange?: () => void;
    applyMetadataSelectionAfter?: boolean;
  } = {
    ...selectionOptions,
    applyMetadataSelectionAfter: true,
  };
  if (selectionEnabled && options.onChange !== undefined) {
    createSelectionOptions.onChange = options.onChange;
  }
  const selectionState = createSelection(rawOps, createSelectionOptions);
  rawOps.subscribe((applied) => {
    lastPatch = [...applied];
  });
  const snapSelection = (): SelectionSnap => selectionState.snapshot();

  const recordHistory = (
    before: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: SelectionSnap,
    selectionAfter: SelectionSnap,
    metadata?: HistoryTransactionOptions,
  ): void => {
    const inverse = computeInverses(before, operations);
    if (!inverse.ok) return;
    const entry: HistoryEntry = {
      forward: [...operations],
      inverse: inverse.inverses,
      selectionBefore,
      selectionAfter,
    };
    if (metadata) entry.metadata = { ...metadata };
    stack = historyCommit(stack, entry, historyLimit);
  };

  const patch: JSONOps<z.output<S>>["patch"] = (operations, metadata) => {
    const before = rawOps.state;
    const selectionBefore = snapSelection();
    const changeMetadata = buildChangeMetadata(activeHistoryMetadata, metadata, selectionBefore);
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = snapSelection();
    if (r.ok && operations.length === 0) lastPatch = [];
    if (r.ok && historyLimit > 0 && !isRestoring && operations.length > 0) {
      recordHistory(before, operations, selectionBefore, selectionAfter, changeMetadata);
    }
    return r;
  };

  const commit = (
    operations: ReadonlyArray<JSONPatchOperation>,
    commitOptions: JSONDocumentCommitOptions = {},
  ): JSONResult => {
    const { selection, ...metadataOptions } = commitOptions;
    if (selection === undefined) return patch(operations, metadataOptions);

    const before = rawOps.state;
    const selectionBefore = snapSelection();
    const predicted = applyPatch(schema, before, operations);
    if (!predicted.result.ok) return patch(operations, metadataOptions);

    const selectionAfter = resolveCommitSelection(selectionBefore, selection, predicted.state, selectionMode);
    const changeMetadata = buildChangeMetadata(
      activeHistoryMetadata,
      {
        ...metadataOptions,
        selectionAfter,
      },
      selectionBefore,
    );
    const r = rawOps.patch(operations, changeMetadata);
    if (!r.ok) return r;

    if (operations.length === 0) lastPatch = [];
    selectionState.restore(selectionAfter);
    if (historyLimit > 0 && !isRestoring && operations.length > 0) {
      recordHistory(before, operations, selectionBefore, selectionAfter, changeMetadata);
    }
    return r;
  };

  const restore = (direction: "undo" | "redo"): boolean => {
    const popped = direction === "undo" ? historyBack(stack) : historyForward(stack);
    if (!popped) return false;
    const entry = popped.entry;
    if (direction === "undo") entry.selectionAfter = snapSelection();
    isRestoring = true;
    try {
      const r = rawOps.patch(direction === "undo" ? entry.inverse : entry.forward);
      if (!r.ok) return false;
    } catch {
      return false;
    } finally {
      isRestoring = false;
    }
    stack = popped.next;
    selectionState.restore(direction === "undo" ? entry.selectionBefore : entry.selectionAfter);
    return true;
  };

  const ops: JSONDocumentOps<z.output<S>> = {
    add: (path, value) => patch([{ op: "add", path: path as Pointer, value }]),
    remove: (path) => patch([{ op: "remove", path: path as Pointer }]),
    replace: (path, value) => patch([{ op: "replace", path: path as Pointer, value }]),
    move: (from, path) => patch([{ op: "move", from: from as Pointer, path: path as Pointer }]),
    copy: (from, path) => patch([{ op: "copy", from: from as Pointer, path: path as Pointer }]),
    test: rawOps.test,
    set(path, value) {
      const p = path as Pointer;
      let segments: string[];
      try {
        segments = parsePointer(p);
      } catch {
        return rawOps.set(path, value);
      }
      const current = readAt(rawOps.state, segments);
      if (value === undefined) {
        if (!current.ok) return { ok: true };
        return patch([{ op: "remove", path: p }]);
      }
      if (!current.ok) return patch([{ op: "add", path: p, value }]);
      if (current.value === value) return { ok: true };
      return patch([{ op: "replace", path: p, value }]);
    },
    patch,
    apply(operations, metadata) {
      const r = patch(operations, metadata);
      if (!r.ok) throw new JSONCrudError("patch", r);
    },
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => historyCanUndo(stack),
    canRedo: () => historyCanRedo(stack),
    load(value, loadOptions?: JSONLoadOptions) {
      const r = rawOps.load(value);
      if (r.ok && !loadOptions?.preserveHistory) stack = emptyHistory<HistoryEntry>();
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      if (r.ok) stack = emptyHistory<HistoryEntry>();
      return r;
    },
    subscribe(listener) {
      return rawOps.subscribe((applied, metadata) => {
        listener(applied, {
          ...metadata,
          selectionAfter: metadata?.selectionAfter ?? snapSelection(),
        });
      });
    },
    get state() { return rawOps.state; },
  };

  const mergeLast = (mergeOptions?: HistoryMergeOptions): boolean => {
    if (isRestoring) return false;
    const next = historyMergeLast(stack, (prev, top) => {
      const metadata = mergeEntryMetadata(prev, top, mergeOptions);
      return {
        forward: [...prev.forward, ...top.forward],
        inverse: [...top.inverse, ...prev.inverse],
        selectionBefore: prev.selectionBefore,
        selectionAfter: top.selectionAfter,
        ...(metadata ? { metadata } : {}),
      };
    });
    if (!next) return false;
    stack = next;
    return true;
  };

  const withHistoryMetadata = (metadata: HistoryTransactionOptions | undefined, fn: () => void): void => {
    const previous = activeHistoryMetadata;
    activeHistoryMetadata = metadata ? { ...previous, ...metadata } : previous;
    try {
      fn();
    } finally {
      activeHistoryMetadata = previous;
    }
  };

  const transaction = (
    optionsOrFn: HistoryTransactionOptions | (() => void),
    maybeFn?: () => void,
  ): void => {
    const hasOptions = typeof optionsOrFn !== "function";
    const transactionOptions = hasOptions ? optionsOrFn : undefined;
    const fn = hasOptions ? maybeFn : optionsOrFn;
    if (!fn) return;
    const depthBefore = stack.undo.length;
    withHistoryMetadata(transactionOptions, fn);
    while (stack.undo.length > depthBefore + 1) {
      if (!mergeLast()) break;
    }
  };

  const history: JSONDocumentHistory = {
    get canUndo() { return ops.canUndo(); },
    get canRedo() { return ops.canRedo(); },
    get undoDepth() { return stack.undo.length; },
    get redoDepth() { return stack.redo.length; },
    mergeLast,
    transaction,
  };

  const selectionRef = { get current() { return selectionState; } };
  const commands = buildCommands({ schema, ops, selectionRef, selectionMode });
  const check = buildCheck({ schema, ops, selectionRef });
  const can = buildCan({ schema, ops, check });
  const clipboardOptions = {
    schema,
    getState: () => rawOps.state,
    ops,
    getSelectionSource: () => selectionState.selectedSource,
    getSelectionTarget: () => selectionState.primaryPointer,
  };
  const clipboard = createClipboardState(options.onChange === undefined
    ? clipboardOptions
    : { ...clipboardOptions, onChange: options.onChange });
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...lastPatch]; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    ops,
    commands,
    can,
    check,
    clipboard,
    schema: schemaState,
    commit,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
  };
}

function resolveCommitSelection(
  current: SelectionSnap,
  selection: JSONDocumentCommitSelection,
  state: unknown,
  mode: SelectionMode,
): SelectionSnap {
  return isSelectionSnap(selection)
    ? restoreSelection(selection, mode, state)
    : reduceSelection(current, selection, mode, state);
}

function isSelectionSnap(selection: JSONDocumentCommitSelection): selection is SelectionSnap {
  return typeof selection === "object"
    && selection !== null
    && "selectionRanges" in selection
    && "selectedPointers" in selection
    && "primaryIndex" in selection;
}

function buildChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
  selectionBefore: SelectionSnap,
): JSONChangeMetadata {
  return {
    ...active,
    ...direct,
    selectionBefore,
  };
}

function mergeEntryMetadata(
  prev: HistoryEntry,
  top: HistoryEntry,
  options?: HistoryMergeOptions,
): HistoryTransactionOptions | undefined {
  const merged = { ...prev.metadata, ...top.metadata, ...options };
  return Object.keys(merged).length > 0 ? merged : undefined;
}
