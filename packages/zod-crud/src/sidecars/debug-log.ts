// useDebugLog — 모든 단계의 trace 를 timeline 에 모아 reproduce 없이 디버깅 가능하게.
// session recorder 와 다른 점:
//   - recorder 는 RFC 6902 ops 만 (재생용)
//   - debug log 는 입력·dispatch·command·commit·selection·toast 모두 (분석용)
//
// 외부에서 logger.log(kind, data) 로 임의 event 추가. ops.subscribe + selection state 는
// 자동 tap. timeline 은 download 가능한 JSON.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONOps } from "../jsonOps.js";
import type { SelectionState } from "../hooks/useSelection.js";
import type { JSONPatchOperation } from "../core/patch/index.js";
import { cloneJson } from "../core/json.js";

export interface DebugEvent {
  t: number;                          // recording 시작 기준 ms
  kind: string;
  data?: Record<string, unknown>;
}

export interface DebugLog<T> {
  startedAt: number;
  initialState: T;
  events: DebugEvent[];
}

export interface DebugLogger {
  enabled: boolean;
  log(kind: string, data?: Record<string, unknown>): void;
}

export interface DebugLogApi<T> extends DebugLogger {
  events: ReadonlyArray<DebugEvent>;
  start(): void;
  stop(): DebugLog<T>;
  clear(): void;
}

export function useDebugLog<T>(
  ops: JSONOps<T>,
  selection?: SelectionState<T>,
): DebugLogApi<T> {
  const [enabled, setEnabled] = useState(false);
  const [, force] = useState(0);
  const startRef = useRef<{ at: number; initial: T } | null>(null);
  const eventsRef = useRef<DebugEvent[]>([]);

  const log = useCallback((kind: string, data?: Record<string, unknown>) => {
    if (!startRef.current) return;
    const e: DebugEvent = { t: Date.now() - startRef.current.at, kind };
    if (data !== undefined) e.data = cloneJson(data);
    eventsRef.current.push(e);
  }, []);

  // ops.subscribe — 모든 commit 마다 applied + before/after state snapshot.
  // before 는 직전 known state 캐싱 (subscribe 가 after 만 주므로).
  const lastStateRef = useRef<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    lastStateRef.current = cloneJson(ops.state);
    return ops.subscribe((applied) => {
      const before = lastStateRef.current;
      const after = cloneJson(ops.state);
      lastStateRef.current = after;
      log("commit", { applied: [...applied] as JSONPatchOperation[], before, after });
    });
  }, [enabled, ops, log]);

  // selection 전이 — useEffect 가 selection 객체 정체성 바뀔 때마다 (= snap 변경) 발화.
  useEffect(() => {
    if (!enabled || !selection) return;
    log("selection", {
      ranges: [...selection.ranges],
      anchor: selection.anchor,
      focus: selection.focus,
      isCollapsed: selection.isCollapsed,
      type: selection.type,
    });
  }, [enabled, selection, log]);

  const start = useCallback(() => {
    if (startRef.current) return;
    startRef.current = { at: Date.now(), initial: cloneJson(ops.state) };
    eventsRef.current = [];
    setEnabled(true);
    force((n) => n + 1);
  }, [ops]);

  const stop = useCallback((): DebugLog<T> => {
    const s = startRef.current;
    const events = cloneJson(eventsRef.current);
    const initialState = cloneJson((s?.initial ?? ops.state) as T);
    startRef.current = null;
    setEnabled(false);
    return {
      startedAt: s?.at ?? Date.now(),
      initialState,
      events,
    };
  }, [ops]);

  const clear = useCallback(() => {
    eventsRef.current = [];
    force((n) => n + 1);
  }, []);

  return useMemo<DebugLogApi<T>>(
    () => ({ enabled, events: eventsRef.current, log, start, stop, clear }),
    [enabled, log, start, stop, clear],
  );
}
