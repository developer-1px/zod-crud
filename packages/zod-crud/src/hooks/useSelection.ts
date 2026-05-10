// SPEC §5.7 — Selection state hook (Axis 2).
// 정체성: "다음 명령의 작용 범위" (command scope). focus 와 같은 자동 규칙 4 개로 mutation 응답.
// 모든 좌표 = RFC 6901 Pointer. 모든 상태 = JSON 직렬화. ARIA Listbox/Tree/Grid 어휘.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trackPointer, pickAutoTarget, recoverLostPointer, exists } from "../core/track.js";
import type { Pointer } from "../core/pointer/index.js";
import type { JsonOps } from "./useJson.js";

export type SelectionMode = "single" | "multiple" | "extended";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<Pointer>;
}

export interface SelectionState<T> {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
  has(pointer: Pointer): boolean;
  set(pointers: ReadonlyArray<Pointer>): void;
  add(pointer: Pointer): void;
  remove(pointer: Pointer): void;
  toggle(pointer: Pointer): void;
  clear(): void;
  range(anchor: Pointer, focus: Pointer): void;
}

interface InternalState {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

const EMPTY: InternalState = { values: [], anchor: null, focus: null };

export function useSelection<T>(
  ops: JsonOps<T>,
  options: UseSelectionOptions = {},
): SelectionState<T> {
  const mode: SelectionMode = options.mode ?? "single";
  const [snap, setSnap] = useState<InternalState>(() =>
    options.initial && options.initial.length > 0
      ? {
          values: limitMode(mode, options.initial),
          anchor: options.initial[0] ?? null,
          focus: options.initial[options.initial.length - 1] ?? null,
        }
      : EMPTY,
  );

  // SPEC §5.7 자동 규칙 4 개:
  //   ① Mutation auto-select  — add/copy/move 발생 시 destination 으로 set([dest])
  //   ② Lost recovery         — 사라진 항목은 nextSibling/prev/parent 로 복구
  //   ③ Index shift tracking  — 살아남은 형제 인덱스 자동 보정 (trackPointers)
  //   ④ Anchor tracking       — anchor 도 동일 규칙
  useEffect(() => {
    return ops.subscribe((applied) => {
      const after = ops.state;
      // 한 좌표를 추적 → 사라지면 복구. null 입력은 null 보존.
      const trackOrRecover = (p: Pointer | null): Pointer | null => {
        if (p === null) return null;
        const t = trackPointer(p, applied);
        if (t !== null && exists(after, t)) return t;
        return recoverLostPointer(p, applied, after);
      };
      setSnap((prev) => {
        // rule ① — mutation 의 destination 이 새 selection
        const autoTarget = pickAutoTarget(applied, after);
        if (autoTarget !== null) {
          return { values: limitMode(mode, [autoTarget]), anchor: autoTarget, focus: autoTarget };
        }
        // rule ②③ — 각 항목 추적/복구, 중복 제거
        const nextValues: Pointer[] = [];
        for (const p of prev.values) {
          const next = trackOrRecover(p);
          if (next !== null && !nextValues.includes(next)) nextValues.push(next);
        }
        // rule ④ — anchor·focus 도 동일 규칙
        const nextAnchor = trackOrRecover(prev.anchor);
        const nextFocus = trackOrRecover(prev.focus);
        if (
          sameArray(nextValues, prev.values) &&
          nextAnchor === prev.anchor &&
          nextFocus === prev.focus
        ) return prev;
        return { values: nextValues, anchor: nextAnchor, focus: nextFocus };
      });
    });
  }, [ops, mode]);

  const set = useCallback(
    (pointers: ReadonlyArray<Pointer>) => {
      setSnap(() => {
        const limited = limitMode(mode, pointers);
        return {
          values: limited,
          anchor: limited.length > 0 ? limited[0]! : null,
          focus: limited.length > 0 ? limited[limited.length - 1]! : null,
        };
      });
    },
    [mode],
  );

  const add = useCallback(
    (pointer: Pointer) => {
      setSnap((prev) => {
        if (prev.values.includes(pointer)) {
          return { ...prev, focus: pointer };
        }
        const merged: Pointer[] = mode === "single" ? [pointer] : [...prev.values, pointer];
        return {
          values: merged,
          anchor: prev.anchor ?? pointer,
          focus: pointer,
        };
      });
    },
    [mode],
  );

  const remove = useCallback((pointer: Pointer) => {
    setSnap((prev) => {
      if (!prev.values.includes(pointer)) return prev;
      const next = prev.values.filter((p) => p !== pointer);
      return {
        values: next,
        anchor: prev.anchor === pointer ? null : prev.anchor,
        focus: prev.focus === pointer ? next[next.length - 1] ?? null : prev.focus,
      };
    });
  }, []);

  const toggle = useCallback(
    (pointer: Pointer) => {
      setSnap((prev) => {
        if (prev.values.includes(pointer)) {
          const next = prev.values.filter((p) => p !== pointer);
          return {
            values: next,
            anchor: prev.anchor === pointer ? null : prev.anchor,
            focus: prev.focus === pointer ? next[next.length - 1] ?? null : prev.focus,
          };
        }
        const merged: Pointer[] = mode === "single" ? [pointer] : [...prev.values, pointer];
        return {
          values: merged,
          anchor: prev.anchor ?? pointer,
          focus: pointer,
        };
      });
    },
    [mode],
  );

  const clear = useCallback(() => setSnap(EMPTY), []);

  const range = useCallback(
    (anchor: Pointer, focus: Pointer) => {
      if (mode !== "extended" && mode !== "multiple") {
        setSnap({ values: [focus], anchor: focus, focus });
        return;
      }
      // anchor 와 focus 가 같은 array 부모를 가리키면 [anchor..focus] 인덱스 범위 펼침.
      // 그 외에는 두 개만 선택.
      const expanded = expandRange(anchor, focus);
      setSnap({ values: expanded, anchor, focus });
    },
    [mode],
  );

  const valuesRef = useRef(snap.values);
  valuesRef.current = snap.values;

  return useMemo<SelectionState<T>>(
    () => ({
      values: snap.values,
      anchor: snap.anchor,
      focus: snap.focus,
      has(pointer) { return valuesRef.current.includes(pointer); },
      set,
      add,
      remove,
      toggle,
      clear,
      range,
    }),
    [snap, set, add, remove, toggle, clear, range],
  );
}

function limitMode(mode: SelectionMode, pointers: ReadonlyArray<Pointer>): Pointer[] {
  if (mode === "single") return pointers.length > 0 ? [pointers[pointers.length - 1]!] : [];
  return [...pointers];
}

function sameArray(a: ReadonlyArray<Pointer>, b: ReadonlyArray<Pointer>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function expandRange(anchor: Pointer, focus: Pointer): Pointer[] {
  // 같은 부모 array 안에서만 범위 확장. 그 외는 [anchor, focus] 둘만.
  const aSeg = anchor.split("/");
  const fSeg = focus.split("/");
  if (aSeg.length !== fSeg.length || aSeg.length < 2) return uniq([anchor, focus]);
  for (let i = 0; i < aSeg.length - 1; i++) if (aSeg[i] !== fSeg[i]) return uniq([anchor, focus]);
  const aIdx = Number(aSeg[aSeg.length - 1]);
  const fIdx = Number(fSeg[fSeg.length - 1]);
  if (!Number.isInteger(aIdx) || !Number.isInteger(fIdx)) return uniq([anchor, focus]);
  const lo = Math.min(aIdx, fIdx);
  const hi = Math.max(aIdx, fIdx);
  const parent = aSeg.slice(0, -1).join("/");
  const out: Pointer[] = [];
  for (let i = lo; i <= hi; i++) out.push(`${parent}/${i}`);
  return out;
}

function uniq(arr: Pointer[]): Pointer[] {
  return Array.from(new Set(arr));
}
