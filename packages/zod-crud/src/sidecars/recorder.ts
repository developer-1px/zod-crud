// SPEC §5 — session recording (선택적 hook).
// ops.subscribe 로 모든 commit 을 timestamp 와 함께 누적해 직렬화 가능한 Recording 으로
// 노출한다. replayRecording 으로 다른 ops 인스턴스에 재생.
//
// JSON 직렬화: Recording 은 RFC 6902 ops + ms 타임스탬프만 담아 그대로 저장/로드 가능.

import { useEffect, useMemo, useReducer } from "react";
import type { JSONOps } from "../jsonOps.js";
import { createRecorder } from "./replayRecording.js";
import type { RecorderApi } from "./replayRecording.js";
export { createRecorder, replayRecording } from "./replayRecording.js";
export type {
  CreateRecorderOptions,
  HeadlessRecorderApi,
  RecorderApi,
  RecordedStep,
  Recording,
  ReplayDocumentTarget,
  ReplayOptions,
  ReplaySelectionTarget,
  ReplayTarget,
} from "./replayRecording.js";

export function useRecorder<T>(ops: JSONOps<T>): RecorderApi<T> {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const recorder = useMemo(() => createRecorder(ops, { onChange: force }), [ops]);

  useEffect(() => () => recorder.dispose(), [recorder]);

  return recorder;
}
