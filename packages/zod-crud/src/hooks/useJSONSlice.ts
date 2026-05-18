// #65 — selector subscription. 특정 path 의 slice 만 구독.
// applyPatch 의 structural sharing (#57) 덕분에 touched 외 subtree reference 가 안정.
// useSyncExternalStore 의 Object.is 비교로 자동 skip — listener 측 필터 불필요.

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Pointer } from "../core/pointer/index.js";
import { readAt, tryParsePointer } from "../core/pointer/index.js";
import type { ValueAt } from "../core/pointer/types.js";
import type { JSONOps } from "../jsonOps.js";

/**
 * 특정 pointer 의 값만 구독한다. 다른 path 변경 시 re-render 안 됨.
 * 경로가 없거나 path_not_found 면 undefined 반환.
 */
export function useJSONSlice<T, P extends string>(
  ops: JSONOps<T>,
  path: P,
): ValueAt<T, P> | undefined {
  const segments = useMemo(() => tryParsePointer(path as Pointer), [path]);
  const getSnapshot = useCallback((): ValueAt<T, P> | undefined => {
    if (segments === null) return undefined;
    const r = readAt(ops.state, segments);
    return r.ok ? (r.value as ValueAt<T, P>) : undefined;
  }, [ops, segments]);
  return useSyncExternalStore(ops.subscribe, getSnapshot, getSnapshot);
}
