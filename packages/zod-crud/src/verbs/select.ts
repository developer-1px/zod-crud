// verbs/select — Selection 기둥, RFC 6901 + W3C Selection.
// pure composer. core/selection 의 reduceSelection + applySelectionAutoRules wrapping.

import {
  reduceSelection as coreReduce,
  applySelectionAutoRules as coreAutoRules,
  type SelectionAction,
  type SelectionMode,
  type SelectionSnap,
  EMPTY_SELECTION,
} from "../core/selection/index.js";
import type { Pointer } from "../core/pointer/index.js";
import type { JsonPatchOperation } from "../core/patch/index.js";

/**
 * Selection action 을 적용하여 새 selection 을 산출한다.
 * pure. React 무관. selection-aware sugar 는 hooks/useJsonDocument 가 담당.
 */
export function select(
  current: SelectionSnap,
  action: SelectionAction,
  mode: SelectionMode = "single",
): SelectionSnap {
  return coreReduce(current, action, mode);
}

/**
 * RFC 6902 patch 적용 후 자동 규칙으로 selection 을 추적한다.
 * (mutation auto-select / lost recovery / index shift / anchor tracking)
 */
export function trackSelection(
  current: SelectionSnap,
  patch: ReadonlyArray<JsonPatchOperation>,
  beforeState: unknown,
  afterState: unknown,
  mode: SelectionMode = "single",
): SelectionSnap {
  return coreAutoRules(current, patch, beforeState, afterState, mode);
}

export { EMPTY_SELECTION };
export type { SelectionAction, SelectionMode, SelectionSnap, Pointer };
