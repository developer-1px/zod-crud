// SPEC §5.8 — Focus state (Axis 2). 정체성: "다음 키 입력의 도착지".
// 순수 함수. React 무관.
//
// 자동 규칙 2 개:
//   ① add/copy/move → destination 자동 포커스 (= pickAutoTarget)
//   ② focus 좌표 사라짐 → nextSibling → prevSibling → parent 복구 (= recoverLostPointer)

import { trackPointer, pickAutoTarget, recoverLostPointer, exists } from "./track.js";
import type { Pointer } from "./pointer/index.js";
import type { JsonPatchOperation } from "./patch/index.js";

export type FocusSnap = Pointer | null;

export function applyFocusAutoRules(
  prev: FocusSnap,
  applied: ReadonlyArray<JsonPatchOperation>,
  after: unknown,
): FocusSnap {
  const autoTarget = pickAutoTarget(applied, after);
  if (autoTarget !== null) return autoTarget;
  if (prev === null) return null;
  const tracked = trackPointer(prev, applied);
  if (tracked !== null && exists(after, tracked)) return tracked;
  return recoverLostPointer(prev, applied, after);
}
