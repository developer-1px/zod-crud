// SPEC §5.8 — Focus state hook (Axis 2). 단일 활성 좌표.
// aria-activedescendant 의 의미.

import { useCallback, useEffect, useMemo, useState } from "react";

import { trackPointer } from "./core/track.js";
import type { Pointer } from "./core/pointer.js";
import type { JsonOps } from "./useJson.js";

export interface UseFocusOptions<T> {
  initial?: Pointer | null;
  filter?: (state: T, pointer: Pointer) => boolean;
  recover?: (state: T, removed: Pointer) => Pointer | null;
}

export interface FocusState<T> {
  value: Pointer | null;
  set(pointer: Pointer | null): void;
  clear(): void;
}

export function useFocus<T>(
  ops: JsonOps<T>,
  options: UseFocusOptions<T> = {},
): FocusState<T> {
  const [value, setValue] = useState<Pointer | null>(options.initial ?? null);

  useEffect(() => {
    return ops.subscribe((applied) => {
      setValue((prev) => {
        if (prev === null) return prev;
        const next = trackPointer(prev, applied);
        if (next === null) {
          // 사라진 좌표 — recover 시도
          if (options.recover) {
            return options.recover(ops.state, prev);
          }
          return null;
        }
        if (options.filter && !options.filter(ops.state, next)) {
          return null;
        }
        return next;
      });
    });
  }, [ops, options.filter, options.recover]);

  const set = useCallback(
    (pointer: Pointer | null) => {
      if (pointer !== null && options.filter && !options.filter(ops.state, pointer)) {
        return;
      }
      setValue(pointer);
    },
    [ops, options.filter],
  );

  const clear = useCallback(() => setValue(null), []);

  return useMemo<FocusState<T>>(
    () => ({ value, set, clear }),
    [value, set, clear],
  );
}
