// SPEC §5.8 — Focus state hook (Axis 2).
// 정체성: "다음 키 입력의 도착지" (input destination). aria-activedescendant 의미.
// 자동 규칙 두 가지 (사용자 wiring 0):
//   ① add/copy/move → destination 자동 포커스 (= pickAutoTarget)
//   ② focus 좌표 사라짐 → nextSibling → prevSibling → parent 복구 (= recoverLostPointer)
// 수동 set() 은 위 규칙보다 우선.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trackPointer, pickAutoTarget, recoverLostPointer, exists } from "./core/track.js";
import type { Pointer } from "./core/pointer.js";
import type { JsonOps } from "./useJson.js";

export interface UseFocusOptions {
  initial?: Pointer | null;
}

export interface FocusState<T> {
  value: Pointer | null;
  set(pointer: Pointer | null): void;
  clear(): void;
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

      const autoTarget = pickAutoTarget(applied, after);
      if (autoTarget !== null) {
        setValue(autoTarget);
        return;
      }

      if (prev === null) return;
      const tracked = trackPointer(prev, applied);
      if (tracked !== null && exists(after, tracked)) {
        if (tracked !== prev) setValue(tracked);
        return;
      }

      setValue(recoverLostPointer(prev, applied, after));
    });
  }, [ops]);

  const set = useCallback((pointer: Pointer | null) => setValue(pointer), []);
  const clear = useCallback(() => setValue(null), []);

  return useMemo<FocusState<T>>(
    () => ({ value, set, clear }),
    [value, set, clear],
  );
}
