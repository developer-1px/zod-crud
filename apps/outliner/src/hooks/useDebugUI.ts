// debug log UI — 시작/정지/다운로드. zod-crud 의 useDebugLog 위에 outliner 정책.

import { useCallback } from "react";
import { useDebugLog, type DebugLog, type SelectionState, type JsonOps } from "zod-crud";
import type { OutlineNode } from "../schema.js";

export function useDebugUI(
  ops: JsonOps<OutlineNode>,
  selection: SelectionState<OutlineNode> | undefined,
) {
  const dbg = useDebugLog<OutlineNode>(ops, selection);

  const stopAndDownload = useCallback(() => {
    const log: DebugLog<OutlineNode> = dbg.stop();
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outliner-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return log;
  }, [dbg]);

  return {
    enabled: dbg.enabled,
    eventCount: dbg.events.length,
    log: dbg.log,
    start: dbg.start,
    stopAndDownload,
    clear: dbg.clear,
  };
}
