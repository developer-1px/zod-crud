// Headless selection state facade.
// React hook and JSONDocument use this same implementation.

import type { JSONStateOps } from "./stateOps.js";
import type { UseSelectionOptions } from "./selectionOptions.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import {
  anchorPointer,
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
} from "../../domain/selection/index.js";
import {
  replaceSelectionText,
  selectionTextEdits,
  type ReplaceSelectionTextResult,
  type SelectionTextEditOptions,
  type SelectionTextEditsResult,
} from "../../domain/selection/textEdit.js";
import {
  deleteSelectionText,
  type DeleteSelectionTextResult,
  type SelectionTextDeleteOptions,
} from "../../domain/selection/textDelete.js";
import {
  planInitialSelection,
  planSelectionPatchUpdate,
  planSelectionStateUpdate,
  selectionAddRangeAction,
  selectionRemoveRangeAction,
  selectionSelectRangesAction,
  selectionToggleRangeAction,
} from "./selectionPlan.js";

export type { UseSelectionOptions } from "./selectionOptions.js";

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

export interface SelectionState extends SelectionSnap {
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

interface HeadlessSelectionState extends SelectionState {
  dispose(): void;
}

export function createSelection<T>(
  ops: JSONStateOps<T>,
  options: CreateSelectionOptions = {},
): HeadlessSelectionState {
  const mode: SelectionMode = options.mode ?? "single";
  const applyMetadataSelectionAfter =
    (options as InternalCreateSelectionOptions).applyMetadataSelectionAfter === true;
  let snap = planInitialSelection(options, mode, ops.state);
  let disposed = false;
  const listeners = new Set<SelectionChangeListener>();
  const emit = (previous: SelectionSnap): void => {
    if (disposed) return;
    options.onChange?.();
    for (const listener of listeners) {
      listener(selectionSnapshot(snap), selectionSnapshot(previous));
    }
  };
  const hasObservers = (): boolean => options.onChange !== undefined || listeners.size > 0;
  const setSnap = (next: SelectionSnap): void => {
    const plan = planSelectionStateUpdate(snap, next, hasObservers());
    snap = plan.snap;
    if (plan.emit) emit(plan.previous);
  };
  const dispatch = (action: SelectionAction): void => {
    setSnap(reduceSelection(snap, action, mode, ops.state));
  };
  const unsubscribe = ops.subscribe((applied, metadata) => {
    setSnap(planSelectionPatchUpdate({
      current: snap,
      applied,
      state: ops.state,
      mode,
      applyMetadataSelectionAfter,
      metadata,
    }));
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
      dispatch(selectionAddRangeAction(pointOrRange));
    },
    removeRange(pointOrRangeOrIndex) {
      dispatch(selectionRemoveRangeAction(pointOrRangeOrIndex));
    },
    toggleRange(pointOrRange) {
      dispatch(selectionToggleRangeAction(pointOrRange));
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
      dispatch(selectionSelectRangesAction(ranges, anchor, focus, primaryIndex));
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
