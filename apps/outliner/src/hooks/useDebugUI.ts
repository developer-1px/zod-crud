// debug log UI — 시작/정지/다운로드. zod-crud 의 useDebugLog 위에 outliner 정책.

import { useCallback } from "react";
import type { DebugLog, JSONOps, SelectionState } from "zod-crud";
import { useDebugLog } from "zod-crud/react";
import type { OutlineNode } from "../schema.js";

export function useDebugUI(
  ops: JSONOps<OutlineNode>,
  selection: SelectionState<OutlineNode> | undefined,
) {
  const dbg = useDebugLog<OutlineNode>(ops, selection);

  const stopAndShare = useCallback(async () => {
    const log: DebugLog<OutlineNode> = dbg.stop();
    const json = JSON.stringify(log, null, 2);
    // 콘솔 로그 — DevTools 에서 확장 가능한 객체로 보기
    // eslint-disable-next-line no-console
    console.log("[outliner debug log]", log);
    // eslint-disable-next-line no-console
    console.log(json);
    try {
      await navigator.clipboard.writeText(json);
      // eslint-disable-next-line no-console
      console.log(`✓ ${log.events.length} events copied to clipboard (${json.length} chars)`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("clipboard write failed — JSON above is the log", e);
    }
    return log;
  }, [dbg]);

  return {
    enabled: dbg.enabled,
    eventCount: dbg.events.length,
    log: dbg.log,
    start: dbg.start,
    stopAndShare,
    clear: dbg.clear,
  };
}
