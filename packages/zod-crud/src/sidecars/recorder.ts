// SPEC §5 — session recording (선택적 hook).
// ops.subscribe 로 모든 commit 을 timestamp 와 함께 누적해 직렬화 가능한 Recording 으로
// 노출한다. replayRecording 으로 다른 ops 인스턴스에 재생.
//
// JSON 직렬화: Recording 은 RFC 6902 ops + ms 타임스탬프만 담아 그대로 저장/로드 가능.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONOps } from "../jsonOps.js";
import { cloneJson } from "../core/json.js";
import type { JSONChangeMetadata } from "../jsonOps.js";
import type { RecordedStep, Recording } from "./replayRecording.js";
export { replayRecording } from "./replayRecording.js";
export type { RecordedStep, Recording, ReplayOptions } from "./replayRecording.js";

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
    return ops.subscribe((applied, metadata) => {
      const start = startRef.current;
      if (!start) return;
      stepsRef.current.push({
        ops: cloneJson([...applied]),
        at: Date.now() - start.at,
        ...cloneMetadata(metadata),
      });
      force((n) => n + 1);
    });
  }, [isRecording, ops]);

  const start = useCallback(() => {
    if (isRecording) return;
    startRef.current = { at: Date.now(), initial: cloneJson(ops.state) };
    stepsRef.current = [];
    setIsRecording(true);
  }, [isRecording, ops]);

  const stop = useCallback((): Recording<T> => {
    const start = startRef.current;
    const initial = cloneJson((start?.initial ?? ops.state) as T);
    const steps = cloneJson(stepsRef.current);
    startRef.current = null;
    setIsRecording(false);
    return {
      startedAt: start?.at ?? Date.now(),
      initial,
      steps,
    };
  }, [ops]);

  const clear = useCallback(() => {
    stepsRef.current = [];
    if (startRef.current) startRef.current = { at: Date.now(), initial: cloneJson(ops.state) };
    force((n) => n + 1);
  }, [ops]);

  return useMemo(
    () => ({ isRecording, steps: stepsRef.current, start, stop, clear }),
    // stepsRef.current 가 push 될 때 force() 로 reference 가 같지만 force 가 useMemo 무효화
    // 위해 dep 에 force 트리거 사용 — 대신 isRecording 과 callbacks 만 dep, steps 는 매 render 시 ref.current 로 최신
    [isRecording, start, stop, clear],
  );
}

function cloneMetadata(metadata: JSONChangeMetadata | undefined): Partial<RecordedStep> {
  if (!metadata) return {};
  const out: Partial<RecordedStep> = {};
  if (metadata.label !== undefined) out.label = metadata.label;
  if (metadata.origin !== undefined) out.origin = metadata.origin;
  if (metadata.mergeKey !== undefined) out.mergeKey = metadata.mergeKey;
  if (metadata.selectionBefore !== undefined) out.selectionBefore = cloneJson(metadata.selectionBefore);
  if (metadata.selectionAfter !== undefined) out.selectionAfter = cloneJson(metadata.selectionAfter);
  return out;
}
