// 클릭 정책 (W3C Selection 모델):
//   shift+click  = setBaseAndExtent (range 확장 — zod-crud 가 anchor 의 값 종류로 DFS 자가펼침)
//   cmd/ctrl+click = togglePointer (range 내부 pointer 도 개별 제거)
//   click        = collapse

import { useCallback } from "react";
import type { DebugLogger, Pointer, SelectionState } from "zod-crud";
import type { Mode } from "../keymap.js";

export function useClickPolicy<T>(
  selection: SelectionState<T> | undefined,
  setMode: (m: Mode) => void,
  logger?: DebugLogger,
) {
  const onClickText = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    const kind = e.shiftKey && selection.anchor ? "shift" : meta ? "meta" : "plain";
    logger?.log("click.text", { pointer: p, kind, anchorBefore: selection.anchor, focusBefore: selection.focus });
    if (e.shiftKey && selection.anchor) {
      e.preventDefault();
      selection.setBaseAndExtent(selection.anchor, p);
    } else if (meta) {
      e.preventDefault();
      selection.togglePointer(p);
    } else {
      selection.collapse(p);
    }
    setMode("select");
  }, [selection, setMode, logger]);

  const onClickBullet = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    e.preventDefault();
    logger?.log("click.bullet", { pointer: p });
    selection.collapse(p);
    setMode("select");
  }, [selection, setMode, logger]);

  return { onClickText, onClickBullet };
}
