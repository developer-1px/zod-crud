// Headless selection state facade.
// React hook and JSONDocument use this same implementation.

import type { JSONOps } from "./jsonOps.js";
import type { Pointer } from "./core/pointer/index.js";
import { jsonEqual } from "./core/json.js";
import {
  EMPTY_SELECTION,
  anchorPointer,
  applySelectionAutoRules,
  caretPoint,
  caretPointer,
  extendSelectionCursor,
  focusPointer,
  hasSelection,
  isCollapsed,
  isSelected,
  moveSelectionCursor,
  orderPrimarySelectionRange,
  orderSelectionRanges,
  primaryPointer,
  primaryRange,
  rangeCount,
  reduceSelection,
  resolveSelectionCursor,
  resolveSelectionScope,
  restoreSelection,
  selectedCount,
  selectedSource,
  selectSelectionScope,
  selectionSnapshot,
  selectionSpansForPointer,
  selectionType,
  type JSONPoint,
  type SelectionAction,
  type SelectionContext,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionCursorResult,
  type SelectionMode,
  type SelectionOrderOptions,
  type SelectionPointerSpansResult,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionRangeOrderResult,
  type SelectionRangesOrderResult,
  type SelectionScopeOptions,
  type SelectionScopeResult,
  type SelectionScopeTarget,
  type SelectionSnap,
  type SelectionSource,
  type SelectionSpanOptions,
  type SelectionType,
} from "./core/selection/index.js";
import {
  deleteSelectionText,
  replaceSelectionText,
  selectionTextEdits,
  type DeleteSelectionTextResult,
  type ReplaceSelectionTextResult,
  type SelectionTextDeleteOptions,
  type SelectionTextEditOptions,
  type SelectionTextEditsResult,
} from "./core/selection/textEdit.js";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}

interface CreateSelectionOptions extends UseSelectionOptions {
  onChange?: () => void;
}

interface InternalCreateSelectionOptions extends CreateSelectionOptions {
  applyMetadataSelectionAfter?: boolean;
}

type SelectionChangeListener = (
  snapshot: SelectionSnap,
  previous: SelectionSnap,
) => void;

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
  readonly context: SelectionContext | undefined;
  collapse(point: JSONPoint): void;
  setBaseAndExtent(anchor: JSONPoint, focus: JSONPoint): void;
  extend(point: JSONPoint): void;
  addRange(pointOrRange: JSONPoint | SelectionRange): void;
  removeRange(pointOrRangeOrIndex: JSONPoint | SelectionRange | number): void;
  toggleRange(pointOrRange: JSONPoint | SelectionRange): void;
  togglePointer(pointer: Pointer): void;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  resolveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  orderPrimaryRange(options?: SelectionOrderOptions): SelectionRangeOrderResult;
  orderRanges(options?: SelectionOrderOptions): SelectionRangesOrderResult;
  spansForPointer(pointer: Pointer, options?: SelectionSpanOptions): SelectionPointerSpansResult;
  textEdits(replacement: string, options?: SelectionTextEditOptions): SelectionTextEditsResult;
  textPatch(replacement: string, options?: SelectionTextEditOptions): ReplaceSelectionTextResult;
  deleteText(options?: SelectionTextDeleteOptions): DeleteSelectionTextResult;
  selectScope(options?: SelectionScopeOptions): SelectionScopeResult;
  resolveScope(options?: SelectionScopeOptions): SelectionScopeTarget;
  selectRanges(
    ranges: ReadonlyArray<SelectionRangeInput>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  setContext(context: SelectionContext): void;
  clearContext(): void;
  empty(): void;
  isSelected(pointer: Pointer): boolean;
  snapshot(): SelectionSnap;
  toJSON(): SelectionSnap;
  restore(snapshot: SelectionSnap): void;
  subscribe(listener: SelectionChangeListener): () => void;
}

interface HeadlessSelectionState<T> extends SelectionState<T> {
  dispose(): void;
}

export function createSelection<T>(
  ops: JSONOps<T>,
  options: CreateSelectionOptions = {},
): HeadlessSelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  const applyMetadataSelectionAfter =
    (options as InternalCreateSelectionOptions).applyMetadataSelectionAfter === true;
  let snap = initialSelection(options, mode, ops.state);
  let disposed = false;
  const listeners = new Set<SelectionChangeListener>();
  const emit = (previous: SelectionSnap): void => {
    if (disposed) return;
    options.onChange?.();
    for (const listener of listeners) {
      listener(selectionSnapshot(snap), selectionSnapshot(previous));
    }
  };
  const setSnap = (next: SelectionSnap): void => {
    const previous = selectionSnapshot(snap);
    if (sameSelectionSnapshot(previous, next)) return;
    snap = next;
    emit(previous);
  };
  const dispatch = (action: SelectionAction): void => {
    setSnap(reduceSelection(snap, action, mode, ops.state));
  };
  const unsubscribe = ops.subscribe((applied, metadata) => {
    setSnap(applyMetadataSelectionAfter && metadata?.selectionAfter
      ? restoreSelection(metadata.selectionAfter, mode, ops.state)
      : applySelectionAutoRules(snap, applied, ops.state, mode));
  });

  return {
    get selectedPointers() { return [...snap.selectedPointers]; },
    get selectionRanges() { return selectionSnapshot(snap).selectionRanges; },
    get primaryIndex() { return snap.primaryIndex; },
    get context() { return selectionSnapshot(snap).context; },
    get rangeCount() { return rangeCount(snap); },
    get selectedCount() { return selectedCount(snap); },
    get hasSelection() { return hasSelection(snap); },
    get primaryRange() { return primaryRange(snap); },
    get anchorPointer() { return anchorPointer(snap); },
    get focusPointer() { return focusPointer(snap); },
    get selectedSource() { return selectedSource(snap); },
    get primaryPointer() { return primaryPointer(snap); },
    get caret() { return caretPoint(snap); },
    get caretPointer() { return caretPointer(snap); },
    get anchor() { return selectionSnapshot(snap).anchor; },
    get focus() { return selectionSnapshot(snap).focus; },
    get isCollapsed() { return isCollapsed(snap); },
    get type() { return selectionType(snap); },
    collapse(point) { dispatch({ type: "collapse", point }); },
    setBaseAndExtent(anchor, focus) { dispatch({ type: "setBaseAndExtent", anchor, focus }); },
    extend(point) { dispatch({ type: "extend", point }); },
    addRange(pointOrRange) {
      dispatch(isSelectionRange(pointOrRange)
        ? { type: "addRange", range: pointOrRange }
        : { type: "addRange", point: pointOrRange });
    },
    removeRange(pointOrRangeOrIndex) {
      dispatch(typeof pointOrRangeOrIndex === "number"
        ? { type: "removeRange", index: pointOrRangeOrIndex }
        : isSelectionRange(pointOrRangeOrIndex)
          ? { type: "removeRange", range: pointOrRangeOrIndex }
          : { type: "removeRange", point: pointOrRangeOrIndex });
    },
    toggleRange(pointOrRange) {
      dispatch(isSelectionRange(pointOrRange)
        ? { type: "toggleRange", range: pointOrRange }
        : { type: "toggleRange", point: pointOrRange });
    },
    togglePointer(pointer) { dispatch({ type: "togglePointer", pointer }); },
    moveCursor(direction, cursorOptions) {
      const result = moveSelectionCursor(snap, direction, mode, ops.state, cursorOptions);
      if (result.ok) setSnap(result.selection);
      return result;
    },
    extendCursor(direction, cursorOptions) {
      const result = extendSelectionCursor(snap, direction, mode, ops.state, cursorOptions);
      if (result.ok) setSnap(result.selection);
      return result;
    },
    resolveCursor(direction, cursorOptions) {
      const result = resolveSelectionCursor(snap, direction, ops.state, cursorOptions);
      return result.ok
        ? { ...result, selection: selectionSnapshot(snap) }
        : { ...result, selection: selectionSnapshot(snap) };
    },
    orderPrimaryRange(orderOptions) {
      return orderPrimarySelectionRange(snap, ops.state, orderOptions);
    },
    orderRanges(orderOptions) {
      return orderSelectionRanges(snap, ops.state, orderOptions);
    },
    spansForPointer(pointer, spanOptions) {
      return selectionSpansForPointer(snap, pointer, ops.state, spanOptions);
    },
    textEdits(replacement, textEditOptions) {
      return selectionTextEdits(snap, ops.state, replacement, textEditOptions);
    },
    textPatch(replacement, textEditOptions) {
      return replaceSelectionText(snap, ops.state, replacement, textEditOptions);
    },
    deleteText(textDeleteOptions) {
      return deleteSelectionText(snap, ops.state, textDeleteOptions);
    },
    selectScope(scopeOptions) {
      const result = selectSelectionScope(snap, mode, ops.state, scopeOptions);
      if (result.ok) setSnap(result.selection);
      return result;
    },
    resolveScope(scopeOptions) {
      return resolveSelectionScope(ops.state, scopeOptions);
    },
    selectRanges(ranges, anchor, focus, primaryIndex) {
      dispatch({
        type: "selectRanges",
        ranges,
        ...(anchor !== undefined ? { anchor } : {}),
        ...(focus !== undefined ? { focus } : {}),
        ...(primaryIndex !== undefined ? { primaryIndex } : {}),
      });
    },
    setContext(context) { dispatch({ type: "setContext", context }); },
    clearContext() { dispatch({ type: "clearContext" }); },
    empty() { dispatch({ type: "empty" }); },
    isSelected(pointer) { return isSelected(snap, pointer); },
    snapshot() { return selectionSnapshot(snap); },
    toJSON() { return selectionSnapshot(snap); },
    restore(snapshot) { setSnap(restoreSelection(snapshot, mode, ops.state)); },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      unsubscribe();
    },
  };
}

function sameSelectionSnapshot(left: SelectionSnap, right: SelectionSnap): boolean {
  return left.primaryIndex === right.primaryIndex
    && samePointOrNull(left.anchor, right.anchor)
    && samePointOrNull(left.focus, right.focus)
    && sameSelectionContext(left.context, right.context)
    && samePointerArray(left.selectedPointers, right.selectedPointers)
    && left.selectionRanges.length === right.selectionRanges.length
    && left.selectionRanges.every((range, index) => sameRange(range, right.selectionRanges[index]!));
}

function samePointerArray(left: ReadonlyArray<Pointer>, right: ReadonlyArray<Pointer>): boolean {
  return left.length === right.length && left.every((pointer, index) => pointer === right[index]);
}

function sameRange(left: SelectionRange, right: SelectionRange): boolean {
  return samePoint(left.anchor, right.anchor) && samePoint(left.focus, right.focus);
}

function sameSelectionContext(left: SelectionContext | undefined, right: SelectionContext | undefined): boolean {
  return jsonEqual(left, right);
}

function samePointOrNull(left: JSONPoint | null, right: JSONPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return samePoint(left, right);
}

function samePoint(left: JSONPoint, right: JSONPoint): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.path === right.path
    && left.offset === right.offset
    && left.edge === right.edge
    && left.affinity === right.affinity;
}

function initialSelection(
  options: UseSelectionOptions,
  mode: SelectionMode,
  state: unknown,
): SelectionSnap {
  const init = options.initial;
  let snap: SelectionSnap;
  if (!init?.length) {
    snap = EMPTY_SELECTION;
  } else if (init.some(isSelectionRange)) {
    snap = reduceSelection(
      EMPTY_SELECTION,
      { type: "selectRanges", ranges: init },
      mode,
      state,
    );
  } else {
    snap = reduceSelection(
      EMPTY_SELECTION,
      { type: "setBaseAndExtent", anchor: init[0] as JSONPoint, focus: init[init.length - 1] as JSONPoint },
      mode,
      state,
    );
  }
  return options.context === undefined
    ? snap
    : reduceSelection(snap, { type: "setContext", context: options.context }, mode, state);
}

function isSelectionRange(input: SelectionRangeInput): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}
