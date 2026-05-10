// SPEC §5.8 — Focus state hook (Axis 2). pure 로직은 core/focus.ts.
// 이 파일의 역할: useState + ops.subscribe wiring.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyFocusAutoRules, type FocusSnap } from "../core/focus.js";
import type { Pointer } from "../core/pointer/index.js";
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
  const [value, setValue] = useState<FocusSnap>(options.initial ?? null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return ops.subscribe((applied) => {
      const next = applyFocusAutoRules(valueRef.current, applied, ops.state);
      if (next !== valueRef.current) setValue(next);
    });
  }, [ops]);

  const set = useCallback((pointer: Pointer | null) => setValue(pointer), []);
  const clear = useCallback(() => setValue(null), []);

  return useMemo<FocusState<T>>(
    () => ({ value, set, clear }),
    [value, set, clear],
  );
}
