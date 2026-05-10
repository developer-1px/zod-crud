// 클릭 정책 (W3C Selection 모델):
//   shift+click  = setBaseAndExtent (range 확장, anchor 유지)
//   cmd/ctrl+click = toggleRange (multi-select 토글)
//   click        = collapse (단일 캐럿 = collapsed selection)

import { useCallback } from "react";
import type { Pointer, SelectionState } from "zod-crud";
import type { Mode } from "../keymap.js";

export function useClickPolicy<T>(
  selection: SelectionState<T> | undefined,
  setMode: (m: Mode) => void,
) {
  const onClickText = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && selection.anchor) {
      e.preventDefault();
      selection.setBaseAndExtent(selection.anchor, p);
    } else if (meta) {
      e.preventDefault();
      selection.toggleRange(p);
    } else {
      selection.collapse(p);
    }
    setMode("select");
  }, [selection, setMode]);

  const onClickBullet = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection) return;
    e.preventDefault();
    selection.collapse(p);
    setMode("select");
  }, [selection, setMode]);

  return { onClickText, onClickBullet };
}
