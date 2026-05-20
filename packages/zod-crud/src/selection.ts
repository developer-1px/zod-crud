// Headless selection state facade.
// React hook and JSONDocument use this same implementation.

import type { JSONOps } from "./jsonOps.js";
import type { Pointer } from "./core/pointer/index.js";
import {
  EMPTY_SELECTION,
  anchorPointer,
  applySelectionAutoRules,
  caretPoint,
  caretPointer,
  focusPointer,
  hasSelection,
  isCollapsed,
  isSelected,
  primaryPointer,
  primaryRange,
  rangeCount,
  reduceSelection,
  restoreSelection,
  selectedCount,
  selectedSource,
  selectionSnapshot,
  selectionType,
  type JSONPoint,
  type SelectionAction,
  type SelectionMode,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionSnap,
  type SelectionSource,
  type SelectionType,
} from "./core/selection/index.js";

export type {
  JSONPoint,
  SelectionAction,
  SelectionMode,
  SelectionRange,
  SelectionRangeInput,
  SelectionSource,
  SelectionSnap,
  SelectionType,
};

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
}

export interface CreateSelectionOptions extends UseSelectionOptions {
  onChange?: () => void;
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
    ranges: ReadonlyArray<SelectionRangeInput>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  empty(): void;
  isSelected(pointer: Pointer): boolean;
  containsNode(pointer: Pointer): boolean;
  snapshot(): SelectionSnap;
  toJSON(): SelectionSnap;
  restore(snapshot: SelectionSnap): void;
}

export interface HeadlessSelectionState<T> extends SelectionState<T> {
  dispose(): void;
}

export function createSelection<T>(
  ops: JSONOps<T>,
  options: CreateSelectionOptions = {},
): HeadlessSelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  let snap = initialSelection(options, mode, ops.state);
  const emit = (): void => {
    options.onChange?.();
  };
  const setSnap = (next: SelectionSnap): void => {
    snap = next;
    emit();
  };
  const dispatch = (action: SelectionAction): void => {
    setSnap(reduceSelection(snap, action, mode, ops.state));
  };
  const unsubscribe = ops.subscribe((applied) => {
    setSnap(applySelectionAutoRules(snap, applied, ops.state, mode));
  });

  return {
    get ranges() { return [...snap.ranges]; },
    get selectedPointers() { return [...snap.selectedPointers]; },
    get selectionRanges() { return selectionSnapshot(snap).selectionRanges; },
    get primaryIndex() { return snap.primaryIndex; },
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
    selectRanges(ranges, anchor, focus, primaryIndex) {
      dispatch({
        type: "selectRanges",
        ranges,
        ...(anchor !== undefined ? { anchor } : {}),
        ...(focus !== undefined ? { focus } : {}),
        ...(primaryIndex !== undefined ? { primaryIndex } : {}),
      });
    },
    empty() { dispatch({ type: "empty" }); },
    isSelected(pointer) { return isSelected(snap, pointer); },
    containsNode(pointer) { return isSelected(snap, pointer); },
    snapshot() { return selectionSnapshot(snap); },
    toJSON() { return selectionSnapshot(snap); },
    restore(snapshot) { setSnap(restoreSelection(snapshot, mode, ops.state)); },
    dispose() { unsubscribe(); },
  };
}

function initialSelection(
  options: UseSelectionOptions,
  mode: SelectionMode,
  state: unknown,
): SelectionSnap {
  const init = options.initial;
  if (!init?.length) return EMPTY_SELECTION;
  if (init.some(isSelectionRange)) {
    return reduceSelection(
      EMPTY_SELECTION,
      { type: "selectRanges", ranges: init },
      mode,
      state,
    );
  }
  return reduceSelection(
    EMPTY_SELECTION,
    { type: "setBaseAndExtent", anchor: init[0] as JSONPoint, focus: init[init.length - 1] as JSONPoint },
    mode,
    state,
  );
}

function isSelectionRange(input: SelectionRangeInput): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}
