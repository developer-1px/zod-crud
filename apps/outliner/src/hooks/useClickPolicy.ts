// 클릭 정책 (W3C Selection 모델 + DFS 도메인 확장):
//   shift+click  = anchor..p 사이 DFS visible 전체 선택 (nested/위계 무관)
//   cmd/ctrl+click = toggleRange (multi-select 토글)
//   click        = collapse (단일 캐럿)

import { useCallback } from "react";
import type { Pointer, SelectionState } from "zod-crud";
import type { OutlineNode } from "../schema.js";
import type { Mode } from "../keymap.js";
import { dfsRange } from "../pointer-utils.js";

export function useClickPolicy(
  state: OutlineNode,
  selection: SelectionState<OutlineNode> | undefined,
  setMode: (m: Mode) => void,
) {
  const onClickText = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && selection.anchor) {
      e.preventDefault();
      const ranges = dfsRange(state, selection.anchor, p);
      if (ranges.length > 0) selection.selectRanges(ranges, selection.anchor, p);
      else selection.setBaseAndExtent(selection.anchor, p);
    } else if (meta) {
      e.preventDefault();
      selection.toggleRange(p);
    } else {
      selection.collapse(p);
    }
    setMode("select");
  }, [state, selection, setMode]);

  const onClickBullet = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    e.preventDefault();
    selection.collapse(p);
    setMode("select");
  }, [selection, setMode]);

  return { onClickText, onClickBullet };
}
