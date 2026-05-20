// Headless JSONDocument facade.
// React 의존 없이 useJSONDocument 와 같은 편집 표면을 제공한다.

import type * as z from "zod";

import { buildCan, type Can } from "./commands/buildCan.js";
import { buildCommands, type Commands } from "./commands/buildCommands.js";
import { buildCheck, type Check } from "./check.js";
import {
  applyOperation,
  applyPatch,
  computeInverses,
  type JSONPatchOperation,
  type JSONResult,
} from "./core/patch/index.js";
import { parsePointer, readAt, type Pointer } from "./core/pointer/index.js";
import {
  applySelectionAutoRules,
  anchorPointer,
  caretPointer,
  caretPoint,
  EMPTY_SELECTION,
  focusPointer,
  hasSelection,
  isCollapsed,
  isSelected,
  primaryPointer,
  primaryRange,
  rangeCount,
  reduceSelection,
  selectedCount,
  selectedSource,
  selectionSnapshot,
  selectionType,
  type SelectionAction,
  type JSONPoint,
  type SelectionMode,
  type SelectionRange,
  type SelectionSnap,
  type SelectionSource,
  type SelectionType,
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
import { handleResult, JSONCrudError, type ErrorPolicy } from "./JSONCrudError.js";
import { createClipboardState, type ClipboardState } from "./clipboard.js";
import { buildReadFacade, type EntriesResult, type QueryResult, type ReadResult } from "./read.js";
import { createSchemaState, type SchemaState } from "./schema.js";
import type {
  HistoryMergeOptions,
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONChangeListener,
  JSONDocumentOps,
  JSONLoadOptions,
  JSONOps,
  UseJSONOptions,
} from "./jsonOps.js";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<JSONPoint>;
}

export interface SelectionState<T> extends SelectionSnap {
  readonly rangeCount: number;
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  readonly isCollapsed: boolean;
  readonly type: SelectionType;
  readonly primaryRange: SelectionRange | null;
  readonly anchorPointer: Pointer | null;
  readonly focusPointer: Pointer | null;
  readonly selectedSource: SelectionSource | null;
  readonly primaryPointer: Pointer | null;
  readonly caret: JSONPoint | null;
  readonly caretPointer: Pointer | null;
  collapse(point: JSONPoint): void;
  setBaseAndExtent(anchor: JSONPoint, focus: JSONPoint): void;
  extend(point: JSONPoint): void;
  addRange(pointOrRange: JSONPoint | SelectionRange): void;
  removeRange(pointOrRangeOrIndex: JSONPoint | SelectionRange | number): void;
  toggleRange(pointOrRange: JSONPoint | SelectionRange): void;
  selectRanges(
    ranges: ReadonlyArray<Pointer | SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  empty(): void;
  isSelected(pointer: Pointer): boolean;
  containsNode(pointer: Pointer): boolean;
  snapshot(): SelectionSnap;
}

export interface UseJSONDocumentOptions<T> extends UseJSONOptions {
  history?: number;
  selection?: boolean | UseSelectionOptions;
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

export interface JSONDocument<T> {
  readonly value: T;
  readonly selection: SelectionState<T> | undefined;
  readonly history: JSONDocumentHistory;
  readonly ops: JSONDocumentOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState<T>;
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

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions<z.output<S>> = {},
): JSONDocument<z.output<S>> {
  const parsed = schema.safeParse(initial);
  if (!parsed.success) throw parsed.error;

  let state = parsed.data as z.output<S>;
  const initialState = state;
  const policy: ErrorPolicy = options;
  const listeners = new Set<JSONChangeListener>();
  const historyLimit = options.history ?? 0;
  let stack: HistoryStack<HistoryEntry> = emptyHistory<HistoryEntry>();
  let isRestoring = false;
  let activeHistoryMetadata: HistoryTransactionOptions | undefined;

  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof options.selection === "object" ? options.selection : {};
  const selectionMode = selectionOptions.mode ?? "single";
  let selectionSnap = initialSelection(selectionOptions, selectionMode, state);

  const snapSelection = (): SelectionSnap => selectionSnapshot(selectionSnap);

  const dispatchSelection = (action: SelectionAction): void => {
    selectionSnap = reduceSelection(selectionSnap, action, selectionMode, state);
  };

  const selectionState: SelectionState<z.output<S>> = {
    get ranges() { return [...selectionSnap.ranges]; },
    get selectedPointers() { return [...selectionSnap.selectedPointers]; },
    get selectionRanges() { return selectionSnapshot(selectionSnap).selectionRanges; },
    get primaryIndex() { return selectionSnap.primaryIndex; },
    get rangeCount() { return rangeCount(selectionSnap); },
    get selectedCount() { return selectedCount(selectionSnap); },
    get hasSelection() { return hasSelection(selectionSnap); },
    get primaryRange() { return primaryRange(selectionSnap); },
    get anchorPointer() { return anchorPointer(selectionSnap); },
    get focusPointer() { return focusPointer(selectionSnap); },
    get selectedSource() { return selectedSource(selectionSnap); },
    get primaryPointer() { return primaryPointer(selectionSnap); },
    get caret() { return caretPoint(selectionSnap); },
    get caretPointer() { return caretPointer(selectionSnap); },
    get anchor() { return selectionSnapshot(selectionSnap).anchor; },
    get focus() { return selectionSnapshot(selectionSnap).focus; },
    get isCollapsed() { return isCollapsed(selectionSnap); },
    get type() { return selectionType(selectionSnap); },
    collapse(point) { dispatchSelection({ type: "collapse", point }); },
    setBaseAndExtent(anchor, focus) { dispatchSelection({ type: "setBaseAndExtent", anchor, focus }); },
    extend(point) { dispatchSelection({ type: "extend", point }); },
    addRange(pointOrRange) {
      dispatchSelection(isSelectionRange(pointOrRange)
        ? { type: "addRange", range: pointOrRange }
        : { type: "addRange", point: pointOrRange });
    },
    removeRange(pointOrRangeOrIndex) {
      dispatchSelection(typeof pointOrRangeOrIndex === "number"
        ? { type: "removeRange", index: pointOrRangeOrIndex }
        : isSelectionRange(pointOrRangeOrIndex)
          ? { type: "removeRange", range: pointOrRangeOrIndex }
          : { type: "removeRange", point: pointOrRangeOrIndex });
    },
    toggleRange(pointOrRange) {
      dispatchSelection(isSelectionRange(pointOrRange)
        ? { type: "toggleRange", range: pointOrRange }
        : { type: "toggleRange", point: pointOrRange });
    },
    selectRanges(ranges, anchor, focus, primaryIndex) {
      dispatchSelection({
        type: "selectRanges",
        ranges,
        ...(anchor !== undefined ? { anchor } : {}),
        ...(focus !== undefined ? { focus } : {}),
        ...(primaryIndex !== undefined ? { primaryIndex } : {}),
      });
    },
    empty() { dispatchSelection({ type: "empty" }); },
    isSelected(pointer) { return isSelected(selectionSnap, pointer); },
    containsNode(pointer) { return isSelected(selectionSnap, pointer); },
    snapshot() { return snapSelection(); },
  };

  const notify = (applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): void => {
    if (applied.length === 0) return;
    selectionSnap = applySelectionAutoRules(selectionSnap, applied, state, selectionMode);
    if (metadata) metadata.selectionAfter = snapSelection();
    for (const listener of listeners) listener(applied, metadata);
  };

  const dispatch = (
    label: JSONPatchOperation | "patch",
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const before = state;
    const applied = applyPatch(schema, before, operations);
    if (!applied.result.ok) return handleResult(policy, label, applied.result);
    if (applied.state === before) return applied.result;
    state = applied.state;
    notify(applied.applied, metadata);
    return applied.result;
  };

  const rawOps: JSONOps<z.output<S>> = {
    add: (path, value) => dispatch({ op: "add", path: path as Pointer, value }, [{ op: "add", path: path as Pointer, value }]),
    remove: (path) => dispatch({ op: "remove", path: path as Pointer }, [{ op: "remove", path: path as Pointer }]),
    replace: (path, value) => dispatch({ op: "replace", path: path as Pointer, value }, [{ op: "replace", path: path as Pointer, value }]),
    move: (from, path) => dispatch({ op: "move", from: from as Pointer, path: path as Pointer }, [{ op: "move", from: from as Pointer, path: path as Pointer }]),
    copy: (from, path) => dispatch({ op: "copy", from: from as Pointer, path: path as Pointer }, [{ op: "copy", from: from as Pointer, path: path as Pointer }]),
    test(path, value) {
      const op: JSONPatchOperation = { op: "test", path: path as Pointer, value };
      const r = applyOperation(schema, state, op);
      return handleResult(policy, op, r.result);
    },
    set(path, value) {
      const p = path as Pointer;
      let segments: string[];
      try {
        segments = parsePointer(p);
      } catch (error) {
        return handleResult(policy, "set", {
          ok: false,
          code: "invalid_pointer",
          reason: error instanceof Error ? error.message : "invalid JSON Pointer",
          pointer: p,
        });
      }
      const cur = readAt(state, segments);
      if (value === undefined) {
        if (!cur.ok) return { ok: true };
        return ops.patch([{ op: "remove", path: p }]);
      }
      if (!cur.ok) return ops.patch([{ op: "add", path: p, value }]);
      if (cur.value === value) return { ok: true };
      return ops.patch([{ op: "replace", path: p, value }]);
    },
    patch(operations, metadata) {
      return dispatch("patch", operations, metadata);
    },
    apply(operations, metadata) {
      const r = ops.patch(operations, metadata);
      if (!r.ok) throw new JSONCrudError("patch", r);
    },
    load(value) {
      return replaceRoot("load", value);
    },
    reset(value) {
      return replaceRoot("reset", value ?? initialState);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get state() { return state; },
  };

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
    const before = state;
    const selectionBefore = snapSelection();
    const changeMetadata = buildChangeMetadata(activeHistoryMetadata, metadata, selectionBefore);
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = snapSelection();
    if (r.ok && historyLimit > 0 && !isRestoring) {
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
    selectionSnap = direction === "undo" ? entry.selectionBefore : entry.selectionAfter;
    return true;
  };

  const replaceRoot = (label: "load" | "reset", value: unknown): JSONResult => {
    const next = schema.safeParse(value);
    if (!next.success) {
      return handleResult(policy, label, {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(next.error.issues),
      });
    }
    state = next.data as z.output<S>;
    notify([ROOT_REPLACE(state)]);
    return { ok: true };
  };

  const ops: JSONDocumentOps<z.output<S>> = {
    add: (path, value) => patch([{ op: "add", path: path as Pointer, value }]),
    remove: (path) => patch([{ op: "remove", path: path as Pointer }]),
    replace: (path, value) => patch([{ op: "replace", path: path as Pointer, value }]),
    move: (from, path) => patch([{ op: "move", from: from as Pointer, path: path as Pointer }]),
    copy: (from, path) => patch([{ op: "copy", from: from as Pointer, path: path as Pointer }]),
    test: rawOps.test,
    set: rawOps.set,
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
    subscribe: rawOps.subscribe,
    get state() { return state; },
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
  const check = buildCheck({ schema, ops });
  const can = buildCan({ schema, ops, check });
  const clipboard = createClipboardState({ schema, getState: () => state, ops });
  const read = buildReadFacade({ schema, getState: () => state });
  const schemaState = createSchemaState({ schema });

  return {
    get value() { return state; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    ops,
    commands,
    can,
    check,
    clipboard,
    schema: schemaState,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
  };
}

function buildChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
  selectionBefore: SelectionSnap,
): JSONChangeMetadata | undefined {
  const metadata = active || direct ? { ...active, ...direct } : undefined;
  if (!metadata) return undefined;
  return {
    ...metadata,
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

function isSelectionRange(input: JSONPoint | SelectionRange): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}

function initialSelection(
  options: UseSelectionOptions,
  mode: SelectionMode,
  state: unknown,
): SelectionSnap {
  const init = options.initial;
  if (!init?.length) return EMPTY_SELECTION;
  return reduceSelection(
    EMPTY_SELECTION,
    { type: "setBaseAndExtent", anchor: init[0]!, focus: init[init.length - 1]! },
    mode,
    state,
  );
}
