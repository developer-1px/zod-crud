// 녹화 UI 정책 — useRecorder 결과를 download / replay 트리거로 노출.

import { useCallback, useState } from "react";
import { useRecorder, replayRecording, type Recording, type JsonOps } from "zod-crud";
import type { OutlineNode } from "../schema.js";

export function useRecorderUI(ops: JsonOps<OutlineNode>) {
  const rec = useRecorder<OutlineNode>(ops);
  const [replaying, setReplaying] = useState(false);

  const downloadRecording = useCallback((recording: Recording<OutlineNode>) => {
    const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outliner-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const stopAndDownload = useCallback(() => {
    const r = rec.stop();
    if (r.steps.length === 0) return null;
    downloadRecording(r);
    return r;
  }, [rec, downloadRecording]);

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
    stopAndDownload,
    loadAndReplay,
  };
}
