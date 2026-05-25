import type { JSONChangeMetadata } from "./stateOps.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import { jsonEqual } from "../../foundation/jsonEqual.js";
import {
  EMPTY_SELECTION,
  type JSONPoint,
  type SelectionAction,
  type SelectionContext,
  type SelectionMode,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionSnap,
} from "../../domain/selection/selectionTypes.js";
import { applySelectionAutoRules } from "../../domain/selection/selectionAutoRules.js";
import { reduceSelection } from "../../domain/selection/selectionReducer.js";
import {
  restoreSelection,
  selectionSnapshot,
} from "../../domain/selection/selectionSnap.js";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}

export type SelectionStateUpdatePlan =
  | { snap: SelectionSnap; emit: false }
  | { snap: SelectionSnap; emit: true; previous: SelectionSnap };

export interface PlanSelectionPatchUpdateInput {
  current: SelectionSnap;
  applied: ReadonlyArray<JSONPatchOperation>;
  state: unknown;
  mode: SelectionMode;
  applyMetadataSelectionAfter: boolean;
  metadata: JSONChangeMetadata | undefined;
}

export function planSelectionStateUpdate(
  current: SelectionSnap,
  next: SelectionSnap,
  hasObservers: boolean,
): SelectionStateUpdatePlan {
  if (!hasObservers) return { snap: next, emit: false };

  const previous = selectionSnapshot(current);
  if (sameSelectionSnapshot(previous, next)) return { snap: current, emit: false };
  return { snap: next, emit: true, previous };
}

export function planSelectionPatchUpdate(
  input: PlanSelectionPatchUpdateInput,
): SelectionSnap {
  return input.applyMetadataSelectionAfter && input.metadata?.selectionAfter
    ? restoreSelection(input.metadata.selectionAfter, input.mode, input.state)
    : applySelectionAutoRules(input.current, input.applied, input.state, input.mode);
}

export function selectionAddRangeAction(pointOrRange: SelectionRangeInput): SelectionAction {
  return isSelectionRange(pointOrRange)
    ? { type: "addRange", range: pointOrRange }
    : { type: "addRange", point: pointOrRange };
}

export function selectionRemoveRangeAction(
  pointOrRangeOrIndex: JSONPoint | SelectionRange | number,
): SelectionAction {
  return typeof pointOrRangeOrIndex === "number"
    ? { type: "removeRange", index: pointOrRangeOrIndex }
    : isSelectionRange(pointOrRangeOrIndex)
      ? { type: "removeRange", range: pointOrRangeOrIndex }
      : { type: "removeRange", point: pointOrRangeOrIndex };
}

export function selectionToggleRangeAction(pointOrRange: SelectionRangeInput): SelectionAction {
  return isSelectionRange(pointOrRange)
    ? { type: "toggleRange", range: pointOrRange }
    : { type: "toggleRange", point: pointOrRange };
}

export function selectionSelectRangesAction(
  ranges: ReadonlyArray<SelectionRangeInput>,
  anchor?: JSONPoint | null,
  focus?: JSONPoint | null,
  primaryIndex?: number,
): SelectionAction {
  return {
    type: "selectRanges",
    ranges,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(focus !== undefined ? { focus } : {}),
    ...(primaryIndex !== undefined ? { primaryIndex } : {}),
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

export function planInitialSelection(
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

function isSelectionRange(input: SelectionRangeInput): input is SelectionRange {
  return typeof input === "object" && "anchor" in input && "focus" in input;
}
