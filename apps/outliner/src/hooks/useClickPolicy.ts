// 클릭 정책: text·bullet 모두 select 모드 (편집은 Enter 로 명시 진입).
// shift+click = range, cmd/ctrl+click = toggle, 단순 click = 단일 select.

import { useCallback } from "react";
import type { Pointer, SelectionState, FocusState } from "zod-crud";
import type { Mode } from "../keymap.js";

export function useClickPolicy<T>(
  selection: SelectionState<T> | undefined,
  focus: FocusState<T> | undefined,
  setMode: (m: Mode) => void,
) {
  const onClickText = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection || !focus) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && selection.anchor) {
      e.preventDefault();
      selection.range(selection.anchor, p);
    } else if (meta) {
      e.preventDefault();
      selection.toggle(p);
    } else {
      selection.set([p]);
    }
    focus.set(p);
    setMode("select");
  }, [selection, focus, setMode]);

  const onClickBullet = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!selection || !focus) return;
    e.preventDefault();
    selection.set([p]);
    focus.set(p);
    setMode("select");
  }, [selection, focus, setMode]);

  return { onClickText, onClickBullet };
}
