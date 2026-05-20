// verbs/select — Selection 기둥, RFC 6901 + W3C Selection.
// pure composer. core/selection 의 reduceSelection wrapping.

import {
  reduceSelection as coreReduce,
  type SelectionAction,
  type JSONPoint,
  type SelectionMode,
  type SelectionRange,
  type SelectionRangeInput,
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
export type { JSONPoint, SelectionAction, SelectionMode, SelectionRange, SelectionRangeInput, SelectionSnap, Pointer };
