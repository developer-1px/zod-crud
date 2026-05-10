// 텍스트 편집 coalesce 정책 — UI 결정. zod-crud 는 시간을 모름.
// 같은 path 의 연속 dispatch 가 500ms 안에 일어나면 history.mergeLast() 로 한 entry.

import { useCallback, useRef } from "react";

const TEXT_COALESCE_MS = 500;

export function useTextEditCoalesce(mergeLast: () => boolean) {
  const lastAtRef = useRef(0);
  const lastPathRef = useRef<string | null>(null);
  return useCallback((path: string) => {
    const now = Date.now();
    if (lastPathRef.current === path && now - lastAtRef.current < TEXT_COALESCE_MS) {
      mergeLast();
    }
    lastAtRef.current = now;
    lastPathRef.current = path;
  }, [mergeLast]);
}
