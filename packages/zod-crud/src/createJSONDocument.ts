// Headless JSONDocument facade.
// React 의존 없이 useJSONDocument 와 같은 편집 표면을 제공한다.

import type * as z from "zod";

import { buildCan, type Can } from "./commands/buildCan.js";
import { buildCommands, type Commands } from "./commands/buildCommands.js";
import { buildCheck, type Check, type CheckResult } from "./check.js";
import {
  applyPatch,
  type JSONPatchOperation,
  type JSONResult,
} from "./core/patch/index.js";
import { computeInverses } from "./core/patch/inverse.js";
import type { Pointer } from "./core/pointer/index.js";
import {
  reduceSelection,
  restoreSelection,
  type SelectionAction,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionMode,
  type SelectionScopeOptions,
  type SelectionSource,
  type SelectionSnap,
} from "./core/selection/index.js";
import {
  back,
  canRedo,
  canUndo,
  commit as commitHistory,
  emptyHistory,
  forward,
  mergeLast as mergeLastHistory,
  type HistoryStack,
} from "./core/history.js";
import { createClipboard, type ClipboardState } from "./clipboard.js";
import { createJSON } from "./createJSON.js";
import { buildReadFacade, type EntriesResult, type QueryResult, type ReadResult } from "./read.js";
import { createSchemaState, type SchemaState } from "./schema.js";
import { createSelection, type SelectionState, type UseSelectionOptions } from "./selection.js";
import type { ClipboardSource } from "./verbs/copy.js";
import type { DuplicateOpts } from "./verbs/duplicate.js";
import type { PasteMode, PasteOptions } from "./verbs/paste.js";
import type { JSONCrudError } from "./JSONCrudError.js";
import type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONOps,
} from "./jsonOps.js";
import type {
  SelectionTextDeleteOptions,
  SelectionTextEditOptions,
} from "./core/selection/textEdit.js";

export interface UseJSONDocumentOptions<T> {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
  history?: number;
  selection?: boolean | UseSelectionOptions;
  onChange?: () => void;
}

interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  mergeLast(options?: { mergeKey?: string }): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

type JSONDocumentCommitSelection = SelectionAction | SelectionSnap;

interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  /**
   * Final model selection for this edit. When present, it overrides mutation
   * auto-selection and is recorded in the same history entry as the patch.
   */
  selection?: JSONDocumentCommitSelection;
}

export interface JSONDocumentRead {
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}

export type JSONDocumentIntent =
  | { type: "select"; action: SelectionAction; mode?: SelectionMode }
  | { type: "selectScope"; options?: SelectionScopeOptions }
  | { type: "moveCursor"; direction: SelectionCursorDirection; options?: SelectionCursorOptions }
  | { type: "extendCursor"; direction: SelectionCursorDirection; options?: SelectionCursorOptions }
  | { type: "find"; jsonpath: string }
  | { type: "move"; source?: Pointer; target: Pointer }
  | { type: "duplicate"; source?: Pointer; options?: DuplicateOpts }
  | { type: "remove"; source?: SelectionSource }
  | { type: "replace"; path?: Pointer; value: unknown }
  | { type: "replaceText"; replacement: string; options?: SelectionTextEditOptions & HistoryTransactionOptions }
  | { type: "deleteText"; options?: SelectionTextDeleteOptions & HistoryTransactionOptions }
  | { type: "copy"; source?: ClipboardSource }
  | { type: "cut"; source?: ClipboardSource }
  | { type: "paste"; payload?: unknown; target?: Pointer; mode?: PasteMode; options?: PasteOptions }
  | { type: "undo" }
  | { type: "redo" };

export type JSONDocumentPlanResult =
  | CheckResult
  | { ok: false; code: "empty_clipboard"; reason: string };

export type JSONDocumentRunResult<T> =
  | ReturnType<Commands<T>["select"]>
  | ReturnType<Commands<T>["selectScope"]>
  | ReturnType<Commands<T>["moveCursor"]>
  | ReturnType<Commands<T>["extendCursor"]>
  | ReturnType<Commands<T>["find"]>
  | ReturnType<Commands<T>["move"]>
  | ReturnType<Commands<T>["duplicate"]>
  | ReturnType<Commands<T>["remove"]>
  | ReturnType<Commands<T>["replace"]>
  | ReturnType<Commands<T>["replaceText"]>
  | ReturnType<Commands<T>["deleteText"]>
  | ReturnType<Commands<T>["undo"]>
  | ReturnType<Commands<T>["redo"]>
  | ReturnType<ClipboardState<T>["copy"]>
  | ReturnType<ClipboardState<T>["cut"]>
  | ReturnType<ClipboardState<T>["paste"]>;

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly read: JSONDocumentRead;
  readonly selection: SelectionState<T> | undefined;
  readonly history: JSONDocumentHistory;
  readonly ops: JSONOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState<T>;
  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  plan(intent: JSONDocumentIntent): JSONDocumentPlanResult;
  run(intent: JSONDocumentIntent): JSONDocumentRunResult<T>;
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
    stack = commitHistory(stack, entry, historyLimit);
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
    const popped = direction === "undo" ? back(stack) : forward(stack);
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

  const ops: JSONOps<z.output<S>> = {
    add: (path, value) => patch([{ op: "add", path: path as Pointer, value }]),
    remove: (path) => patch([{ op: "remove", path: path as Pointer }]),
    replace: (path, value) => patch([{ op: "replace", path: path as Pointer, value }]),
    move: (from, path) => patch([{ op: "move", from: from as Pointer, path: path as Pointer }]),
    copy: (from, path) => patch([{ op: "copy", from: from as Pointer, path: path as Pointer }]),
    test: rawOps.test,
    patch,
    load(value, loadOptions?: { preserveHistory?: boolean }) {
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

  const historyControls = {
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => canUndo(stack),
    canRedo: () => canRedo(stack),
  };

  const mergeLast = (mergeOptions?: { mergeKey?: string }): boolean => {
    if (isRestoring) return false;
    const next = mergeLastHistory(stack, (prev, top) => {
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
    get canUndo() { return historyControls.canUndo(); },
    get canRedo() { return historyControls.canRedo(); },
    get undoDepth() { return stack.undo.length; },
    get redoDepth() { return stack.redo.length; },
    mergeLast,
    transaction,
  };

  const selectionRef = { get current() { return selectionState; } };
  const commands = buildCommands({ schema, ops, history: historyControls, selectionRef, selectionMode });
  const check = buildCheck({ schema, ops, history: historyControls, selectionRef });
  const can = buildCan({ schema, ops, history: historyControls, check });
  const clipboardOptions = {
    schema,
    getState: () => rawOps.state,
    ops,
    getSelectionSource: () => selectionState.selectedSource,
    getSelectionTarget: () => selectionState.primaryPointer,
  };
  const clipboard = createClipboard(options.onChange === undefined
    ? clipboardOptions
    : { ...clipboardOptions, onChange: options.onChange });
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });
  const planPastePayload = (
    payload: unknown,
    intent: Extract<JSONDocumentIntent, { type: "paste" }>,
  ): JSONDocumentPlanResult => intent.target === undefined
    ? check.paste(payload, intent.mode, intent.options)
    : check.paste(payload, intent.target, intent.mode, intent.options);
  const runPastePayload = (
    payload: unknown,
    intent: Extract<JSONDocumentIntent, { type: "paste" }>,
  ): JSONDocumentRunResult<z.output<S>> => intent.target === undefined
    ? commands.paste(payload, intent.mode, intent.options)
    : commands.paste(payload, intent.target, intent.mode, intent.options);
  const runClipboardPaste = (
    intent: Extract<JSONDocumentIntent, { type: "paste" }>,
  ): JSONDocumentRunResult<z.output<S>> =>
    intent.target === undefined
      ? clipboard.paste(intent.mode, intent.options)
      : clipboard.paste(intent.target, intent.mode, intent.options);
  const plan = (intent: JSONDocumentIntent): JSONDocumentPlanResult => {
    switch (intent.type) {
      case "select":
        return { ok: true };
      case "selectScope":
        return check.selectScope(intent.options);
      case "moveCursor":
        return check.moveCursor(intent.direction, intent.options);
      case "extendCursor":
        return check.extendCursor(intent.direction, intent.options);
      case "find":
        return check.find(intent.jsonpath);
      case "move":
        return intent.source === undefined
          ? check.move(intent.target)
          : check.move(intent.source, intent.target);
      case "duplicate":
        return intent.source === undefined
          ? check.duplicate(intent.options)
          : check.duplicate(intent.source, intent.options);
      case "remove":
        return check.remove(intent.source);
      case "replace":
        return intent.path === undefined
          ? check.replace(intent.value)
          : check.replace(intent.path, intent.value);
      case "replaceText":
        return check.replaceText(intent.replacement, intent.options);
      case "deleteText":
        return check.deleteText(intent.options);
      case "copy":
        return check.copy(intent.source);
      case "cut":
        return check.cut(intent.source);
      case "paste": {
        if ("payload" in intent) return planPastePayload(intent.payload, intent);
        const buffer = clipboard.read();
        return buffer.ok
          ? planPastePayload(buffer.payload, intent)
          : { ok: false, code: "empty_clipboard", reason: buffer.message };
      }
      case "undo":
        return check.undo;
      case "redo":
        return check.redo;
    }
  };
  const run = (intent: JSONDocumentIntent): JSONDocumentRunResult<z.output<S>> => {
    switch (intent.type) {
      case "select":
        return commands.select(intent.action, intent.mode);
      case "selectScope":
        return commands.selectScope(intent.options);
      case "moveCursor":
        return commands.moveCursor(intent.direction, intent.options);
      case "extendCursor":
        return commands.extendCursor(intent.direction, intent.options);
      case "find":
        return commands.find(intent.jsonpath);
      case "move":
        return intent.source === undefined
          ? commands.move(intent.target)
          : commands.move(intent.source, intent.target);
      case "duplicate":
        return intent.source === undefined
          ? commands.duplicate(intent.options)
          : commands.duplicate(intent.source, intent.options);
      case "remove":
        return commands.remove(intent.source);
      case "replace":
        return intent.path === undefined
          ? commands.replace(intent.value)
          : commands.replace(intent.path, intent.value);
      case "replaceText":
        return commands.replaceText(intent.replacement, intent.options);
      case "deleteText":
        return commands.deleteText(intent.options);
      case "copy":
        return clipboard.copy(intent.source);
      case "cut":
        return clipboard.cut(intent.source);
      case "paste":
        return "payload" in intent ? runPastePayload(intent.payload, intent) : runClipboardPaste(intent);
      case "undo":
        return commands.undo();
      case "redo":
        return commands.redo();
    }
  };

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...lastPatch]; },
    read,
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    ops,
    commands,
    can,
    check,
    clipboard,
    schema: schemaState,
    patch,
    plan,
    run,
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
  options?: { mergeKey?: string },
): HistoryTransactionOptions | undefined {
  const merged = { ...prev.metadata, ...top.metadata, ...options };
  return Object.keys(merged).length > 0 ? merged : undefined;
}
