// verbs/select — Selection 기둥, RFC 6901 + W3C Selection.
// pure composer. core/selection 의 reduceSelection wrapping.

import {
  reduceSelection as coreReduce,
  type SelectionAction,
  type SelectionMode,
  type SelectionSnap,
  EMPTY_SELECTION,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";

export function select(
  current: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode = "single",
): SelectionSnap {
  return coreReduce(current, action, mode);
}

export { EMPTY_SELECTION };
export type { SelectionAction, SelectionMode, SelectionSnap, Pointer };
