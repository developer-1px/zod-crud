// React debug-log facade over the headless createDebugLog sidecar.

import { useEffect, useMemo, useReducer } from "react";

import type { JSONOps } from "../jsonOps.js";
import type { SelectionState } from "../selection.js";
import { createDebugLog } from "./createDebugLog.js";
import type { DebugLogApi } from "./createDebugLog.js";

export {
  createDebugLog,
} from "./createDebugLog.js";
export type {
  CreateDebugLogOptions,
  DebugEvent,
  DebugLog,
  DebugLogApi,
  DebugLogger,
  HeadlessDebugLogApi,
} from "./createDebugLog.js";

export function useDebugLog<T>(
  ops: JSONOps<T>,
  selection?: SelectionState<T>,
): DebugLogApi<T> {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const debugLog = useMemo(
    () => createDebugLog(ops, selection, { onChange: force }),
    [ops, selection],
  );

  useEffect(() => () => debugLog.dispose(), [debugLog]);

  return debugLog;
}
