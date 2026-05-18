// SPEC §5 — session recording (선택적 hook).
// ops.subscribe 로 모든 commit 을 timestamp 와 함께 누적해 직렬화 가능한 Recording 으로
// 노출한다. replayRecording 으로 다른 ops 인스턴스에 재생.
//
// JSON 직렬화: Recording 은 RFC 6902 ops + ms 타임스탬프만 담아 그대로 저장/로드 가능.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { JSONOps } from "../jsonOps.js";

export interface RecordedStep {
  ops: ReadonlyArray<JSONPatchOperation>;
  at: number; // recording 시작 시점부터 ms
}

export interface Recording<T> {
  startedAt: number; // epoch ms
  initial: T;
  steps: RecordedStep[];
}

export interface RecorderApi<T> {
  isRecording: boolean;
  steps: ReadonlyArray<RecordedStep>;
  start(): void;
  stop(): Recording<T>;
  clear(): void;
}

export function useRecorder<T>(ops: JSONOps<T>): RecorderApi<T> {
  const [isRecording, setIsRecording] = useState(false);
  const [, force] = useState(0);
  const startRef = useRef<{ at: number; initial: T } | null>(null);
  const stepsRef = useRef<RecordedStep[]>([]);

  useEffect(() => {
    if (!isRecording) return;
    return ops.subscribe((applied) => {
      const start = startRef.current;
      if (!start) return;
      stepsRef.current.push({ ops: [...applied], at: Date.now() - start.at });
      force((n) => n + 1);
    });
  }, [isRecording, ops]);

  const start = useCallback(() => {
    if (isRecording) return;
    startRef.current = { at: Date.now(), initial: ops.state };
    stepsRef.current = [];
    setIsRecording(true);
  }, [isRecording, ops]);

  const stop = useCallback((): Recording<T> => {
    setIsRecording(false);
    const start = startRef.current;
    return {
      startedAt: start?.at ?? Date.now(),
      initial: (start?.initial ?? ops.state) as T,
      steps: [...stepsRef.current],
    };
  }, [ops]);

  const clear = useCallback(() => {
    stepsRef.current = [];
    if (startRef.current) startRef.current = { at: Date.now(), initial: ops.state };
    force((n) => n + 1);
  }, [ops]);

  return useMemo(
    () => ({ isRecording, steps: stepsRef.current, start, stop, clear }),
    // stepsRef.current 가 push 될 때 force() 로 reference 가 같지만 force 가 useMemo 무효화
    // 위해 dep 에 force 트리거 사용 — 대신 isRecording 과 callbacks 만 dep, steps 는 매 render 시 ref.current 로 최신
    [isRecording, start, stop, clear],
  );
}

export interface ReplayOptions {
  speed?: number;            // 1 = real-time, 2 = 2x, Infinity = no delay
  signal?: AbortSignal;
  onStep?: (index: number, total: number) => void;
}

// Recording 을 다른 ops 인스턴스에서 재생. ops.load 로 initial 복원 후 step 사이 delay.
export async function replayRecording<T>(
  recording: Recording<T>,
  ops: JSONOps<T>,
  options: ReplayOptions = {},
): Promise<void> {
  const speed = options.speed ?? 1;
  ops.load(recording.initial);
  let prevAt = 0;
  for (let i = 0; i < recording.steps.length; i++) {
    if (options.signal?.aborted) return;
    const step = recording.steps[i]!;
    const delay = Number.isFinite(speed) ? Math.max(0, (step.at - prevAt) / speed) : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (options.signal?.aborted) return;
    ops.patch(step.ops);
    options.onStep?.(i, recording.steps.length);
    prevAt = step.at;
  }
}
