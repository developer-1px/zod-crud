// verbs/select — Selection 기둥, RFC 6901 + W3C Selection.
// pure composer. core/selection 의 reduceSelection wrapping.

import {
  reduceSelection as coreReduce,
  extendSelectionCursor,
  moveSelectionCursor,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectSelectionScope,
  type SelectionAction,
  type JSONPoint,
  type SelectionCursorDirection,
  type SelectionCursorErrorCode,
  type SelectionCursorOptions,
  type SelectionCursorResult,
  type SelectionCursorTarget,
  type SelectionMode,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionScopeErrorCode,
  type SelectionScopeOptions,
  type SelectionScopeResult,
  type SelectionScopeTarget,
  type SelectionSnap,
  EMPTY_SELECTION,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";

export function select(
  current: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode = "single",
  state?: unknown,
): SelectionSnap {
  return coreReduce(current, action, mode, state);
}

export { EMPTY_SELECTION };
export {
  extendSelectionCursor,
  moveSelectionCursor,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectSelectionScope,
};
export type {
  JSONPoint,
  SelectionAction,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionMode,
  SelectionRange,
  SelectionRangeInput,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionSnap,
  Pointer,
};
