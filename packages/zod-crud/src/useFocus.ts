// SPEC §5.8 — Focus state hook (Axis 2).
// 두 가지 자동 규칙 (사용자 wiring 0):
//   ① Mutation 발생 → 추가/이동된 좌표로 자동 포커스 (paste·insert·copy·move 등)
//   ② Focus 좌표 사라짐 → nextSibling → prevSibling → parent 순으로 재이동
//
// 사용자가 set() 으로 명시 지정한 좌표는 위 규칙보다 우선한다 (수동 set 직후 1회).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trackPointer } from "./core/track.js";
import {
  parentPointer,
  lastSegmentIndex,
  withLastSegment,
  parsePointer,
  buildPointer,
  readAt,
  type Pointer,
} from "./core/pointer.js";
import type { JsonOps } from "./useJson.js";
import type { JsonPatchOperation } from "./core/patch.js";

export interface UseFocusOptions {
  initial?: Pointer | null;
}

export interface FocusState<T> {
  value: Pointer | null;
  set(pointer: Pointer | null): void;
  clear(): void;
}

function exists(state: unknown, pointer: Pointer): boolean {
  return readAt(state, parsePointer(pointer)).ok;
}

// rule ① — applied ops 에서 새 좌표를 식별. add·copy·move 의 destination.
// 첫 번째 매치를 반환. /- (append marker) 는 actual index 로 resolve.
function autoFocusFrom(applied: ReadonlyArray<JsonPatchOperation>, after: unknown): Pointer | null {
  for (const op of applied) {
    let dest: Pointer | null = null;
    if (op.op === "add" || op.op === "copy" || op.op === "move") {
      dest = op.path;
    }
    if (dest === null) continue;
    // root replace ("") 는 load/reset/undo-via-root-replace — auto-focus 하지 않음.
    if (dest === "") continue;
    // /- 를 actual index 로 resolve
    if (dest.endsWith("/-")) {
      const parent = dest.slice(0, -2);
      const arr = readAt(after, parsePointer(parent));
      if (arr.ok && Array.isArray(arr.value) && arr.value.length > 0) {
        return buildPointer([...parsePointer(parent), arr.value.length - 1]);
      }
      return null;
    }
    return dest;
  }
  return null;
}

// rule ② — focus 좌표 사라짐 시 복구: nextSibling → prevSibling → parent 순.
// `lost` 는 op 적용 직전의 focus pointer. `after` 는 op 적용 후 state.
function recoverLostFocus(lost: Pointer, applied: ReadonlyArray<JsonPatchOperation>, after: unknown): Pointer | null {
  const idx = lastSegmentIndex(lost);
  const parent = parentPointer(lost);
  if (idx === null || parent === null) return null;

  // 부모 자체도 op 영향을 받을 수 있으니 parent 도 트래킹
  const trackedParent = trackPointer(parent, applied);
  if (trackedParent === null) return null;

  // nextSibling: same index (제거 후 뒤가 당겨졌으므로 idx 위치는 옛 idx+1)
  const nextCandidate = withLastSegment(`${trackedParent}/${idx}`, idx);
  if (nextCandidate !== null) {
    if (exists(after, nextCandidate)) return nextCandidate;
  }

  // prevSibling: idx - 1
  if (idx > 0) {
    const prevCandidate = `${trackedParent}/${idx - 1}`;
    if (exists(after, prevCandidate)) return prevCandidate;
  }

  // parent (root 면 null)
  if (trackedParent === "") return null;
  if (exists(after, trackedParent)) return trackedParent;

  return null;
}

export function useFocus<T>(
  ops: JsonOps<T>,
  options: UseFocusOptions = {},
): FocusState<T> {
  const [value, setValue] = useState<Pointer | null>(options.initial ?? null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return ops.subscribe((applied) => {
      const prev = valueRef.current;
      const after = ops.state;

      // rule ① — 추가·복제·이동 발생 시 destination 으로 자동 포커스
      const autoTarget = autoFocusFrom(applied, after);
      if (autoTarget !== null) {
        setValue(autoTarget);
        return;
      }

      // 추가가 없으면 기존 focus 추적 → 사라지면 rule ② 복구
      if (prev === null) return;
      const tracked = trackPointer(prev, applied);
      if (tracked !== null && exists(after, tracked)) {
        if (tracked !== prev) setValue(tracked);
        return;
      }

      // rule ② — 사라졌으면 nextSibling → prevSibling → parent
      const recovered = recoverLostFocus(prev, applied, after);
      setValue(recovered);
    });
  }, [ops]);

  const set = useCallback((pointer: Pointer | null) => setValue(pointer), []);
  const clear = useCallback(() => setValue(null), []);

  return useMemo<FocusState<T>>(
    () => ({ value, set, clear }),
    [value, set, clear],
  );
}
