// SPEC §5.9 — Clipboard state hook (Axis 2). copy/cut buffer + paste semantics.
// paste 는 RFC 6902 batch 로 표현되므로 G8 atomicity 그대로.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parsePointer, type Pointer } from "./core/pointer.js";
import { trackPointers } from "./core/track.js";
import type { JsonOps } from "./useJson.js";
import type { JsonPatchOperation, JsonResult } from "./core/patch.js";

export type ClipboardMode = "empty" | "copy" | "cut";

export interface ClipboardSnapshot {
  mode: ClipboardMode;
  values: ReadonlyArray<unknown>;
  sources: ReadonlyArray<Pointer>;
}

export interface UseClipboardOptions {
  initial?: ClipboardSnapshot;
}

export interface ClipboardState<T> extends ClipboardSnapshot {
  copy(sources: ReadonlyArray<Pointer>): void;
  cut(sources: ReadonlyArray<Pointer>): void;
  paste(target: Pointer): JsonResult;
  clear(): void;
}

const EMPTY: ClipboardSnapshot = { mode: "empty", values: [], sources: [] };

function readAt(state: unknown, pointer: Pointer): unknown {
  let cur: unknown = state;
  for (const seg of parsePointer(pointer)) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur;
}

// target Pointer 가 array `/-` (append) 인지, 또는 array `/N` (insert), object key 인지 판별 후
// sources 다중일 때 multi-target 으로 분배.
function expandTargets(target: Pointer, count: number): Pointer[] {
  if (count === 0) return [];
  if (count === 1) return [target];
  const seg = parsePointer(target);
  if (seg.length === 0) {
    // root 에 다중 add 는 의미 없음 — 첫 번째만
    return [target];
  }
  const lastIdx = seg.length - 1;
  const last = seg[lastIdx]!;
  if (last === "-") {
    // 모두 끝에 append — 모두 /-
    return Array.from({ length: count }, () => target);
  }
  const idx = Number(last);
  if (!Number.isInteger(idx)) {
    // object key — 다중 의미 없음
    return [target];
  }
  // /N, /N+1, /N+2 ... 로 연속 insert
  const out: Pointer[] = [];
  const prefix = seg.slice(0, lastIdx);
  for (let i = 0; i < count; i++) {
    out.push("/" + [...prefix, String(idx + i)].join("/"));
  }
  return out;
}

export function useClipboard<T>(
  ops: JsonOps<T>,
  options: UseClipboardOptions = {},
): ClipboardState<T> {
  const [snap, setSnap] = useState<ClipboardSnapshot>(options.initial ?? EMPTY);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // sources 자동 추적 (선택된 노드가 op 로 이동·제거되면 sources 도 갱신).
  // values 는 deep clone 된 상태이므로 op 영향 없음.
  useEffect(() => {
    return ops.subscribe((applied) => {
      setSnap((prev) => {
        if (prev.mode === "empty" || prev.sources.length === 0) return prev;
        const nextSources = trackPointers(prev.sources, applied);
        if (nextSources.length === 0) {
          return EMPTY;
        }
        if (sameArray(nextSources, prev.sources)) return prev;
        // sources 줄어들면 values 도 같은 인덱스만 살림
        if (nextSources.length < prev.sources.length) {
          const surviving = new Set(nextSources);
          const idxMap: number[] = [];
          for (let i = 0; i < prev.sources.length; i++) {
            const next = trackPointers([prev.sources[i]!], applied);
            if (next.length > 0 && surviving.has(next[0]!)) idxMap.push(i);
          }
          const nextValues = idxMap.map((i) => prev.values[i]);
          return { mode: prev.mode, values: nextValues, sources: nextSources };
        }
        return { mode: prev.mode, values: prev.values, sources: nextSources };
      });
    });
  }, [ops]);

  const copy = useCallback(
    (sources: ReadonlyArray<Pointer>) => {
      const values = sources.map((p) => deepCloneJson(readAt(ops.state, p)));
      setSnap({ mode: "copy", values, sources: [...sources] });
    },
    [ops],
  );

  const cut = useCallback(
    (sources: ReadonlyArray<Pointer>) => {
      const values = sources.map((p) => deepCloneJson(readAt(ops.state, p)));
      setSnap({ mode: "cut", values, sources: [...sources] });
    },
    [ops],
  );

  const paste = useCallback(
    (target: Pointer): JsonResult => {
      const cur = snapRef.current;
      if (cur.mode === "empty" || cur.values.length === 0) {
        return { ok: false, code: "path_not_found", reason: "clipboard is empty" };
      }
      const targets = expandTargets(target, cur.values.length);
      let batch: JsonPatchOperation[];
      if (cur.mode === "copy") {
        batch = cur.values.map((v, i) => ({
          op: "add" as const,
          path: targets[i] ?? target,
          value: v,
        }));
      } else {
        // cut: move (sources 의 현재 위치 → target). 인덱스 충돌 회피: 뒤에서부터 처리되도록 reverse.
        // 실제로는 RFC 6902 sequential semantics 라 그냥 순차 move.
        batch = cur.sources.map((from, i) => ({
          op: "move" as const,
          from,
          path: targets[i] ?? target,
        }));
      }
      const r = ops.patch(batch);
      if (r.ok && cur.mode === "cut") {
        // 1회용: cut 후 paste 하면 비움
        setSnap(EMPTY);
      }
      return r;
    },
    [ops],
  );

  const clear = useCallback(() => setSnap(EMPTY), []);

  return useMemo<ClipboardState<T>>(
    () => ({
      mode: snap.mode,
      values: snap.values,
      sources: snap.sources,
      copy,
      cut,
      paste,
      clear,
    }),
    [snap, copy, cut, paste, clear],
  );
}

function deepCloneJson<X>(v: X): X {
  return v === undefined ? (v as X) : (JSON.parse(JSON.stringify(v)) as X);
}

function sameArray<X>(a: ReadonlyArray<X>, b: ReadonlyArray<X>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
