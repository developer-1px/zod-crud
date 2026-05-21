// 녹화 UI 정책 — useRecorder 결과를 download / replay 트리거로 노출.

import { useCallback, useState } from "react";
import { replayRecording, type JSONOps, type Recording } from "zod-crud";
import { useRecorder } from "zod-crud/react";
import type { OutlineNode } from "../schema.js";

export function useRecorderUI(ops: JSONOps<OutlineNode>) {
  const rec = useRecorder<OutlineNode>(ops);
  const [replaying, setReplaying] = useState(false);

  const stopAndShare = useCallback(async () => {
    const r = rec.stop();
    if (r.steps.length === 0) return null;
    const json = JSON.stringify(r, null, 2);
    // eslint-disable-next-line no-console
    console.log("[outliner session recording]", r);
    // eslint-disable-next-line no-console
    console.log(json);
    try {
      await navigator.clipboard.writeText(json);
      // eslint-disable-next-line no-console
      console.log(`✓ ${r.steps.length} steps copied to clipboard (${json.length} chars)`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("clipboard write failed — JSON above is the recording", e);
    }
    return r;
  }, [rec]);

  const loadAndReplay = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const recording = JSON.parse(await f.text()) as Recording<OutlineNode>;
        if (!recording.initial || !Array.isArray(recording.steps)) throw new Error("invalid recording");
        setReplaying(true);
        await replayRecording(recording, ops, { speed: 1 });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("replay failed", e);
      } finally {
        setReplaying(false);
      }
    };
    input.click();
  }, [ops]);

  return {
    isRecording: rec.isRecording,
    stepCount: rec.steps.length,
    replaying,
    start: rec.start,
    stopAndShare,
    loadAndReplay,
  };
}
