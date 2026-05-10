// window-level keydown fallback — focus 가 row 밖에 있을 때도 history 단축키 작동.
// 입력 필드 안의 keydown 은 row 의 onKeyDown 이 처리 (중복 dispatch 방지 stopPropagation).

import { useEffect } from "react";
import { eventToChord, findCommand, type CommandId, type Mode } from "../keymap.js";

export function useGlobalKey(mode: Mode, dispatch: (id: CommandId) => boolean) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.isComposing || e.keyCode === 229) return;
      const id = findCommand(eventToChord(e), mode);
      if (!id) return;
      if (dispatch(id)) e.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, dispatch]);
}
