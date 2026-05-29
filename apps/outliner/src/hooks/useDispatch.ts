// chord → CommandId 디스패치. dispatch 가 true 면 caller 가 preventDefault.
// command 의 JSONResult 실패는 toast 로 surface.

import { useCallback } from "react";
import * as cmd from "../commands/index.js";
import type { CommandId, Mode } from "../keymap.js";
import { focusOf, type CommandContext } from "../commands/index.js";
import { readNode } from "../pointer-utils.js";

interface UseDispatchArgs {
  ctx: CommandContext | null; // null = selection·focus 미초기화
  mode: Mode;
  setMode: (m: Mode) => void;
  pushToast: (level: "error" | "info", text: string) => void;
  undo: () => boolean;
  redo: () => boolean;
}

export function useDispatch({ ctx, mode, setMode, pushToast, undo, redo }: UseDispatchArgs) {
  void mode; // 현재 dispatch 는 mode 를 직접 안 쓰지만 dependency 로 노출
  return useCallback((id: CommandId): boolean => {
    if (!ctx) return false;
    const surface = (r: { ok: boolean; code?: string; reason?: string; message?: string } | void) => {
      if (r && !r.ok) {
        const detail = r.reason ?? r.message;
        pushToast("error", `${r.code}${detail ? `: ${detail}` : ""}`);
      }
    };
    const surfaceResult = (
      task:
        | Promise<{ ok: boolean; code?: string; reason?: string; message?: string } | void>
        | { ok: boolean; code?: string; reason?: string; message?: string }
        | void,
      onOk?: () => void,
    ) => {
      if (!task) return;
      if (!("then" in task)) {
        surface(task);
        if (task.ok) onOk?.();
        return;
      }
      void task
        .then((result) => {
          surface(result);
          if (result?.ok) onOk?.();
        })
        .catch((error: unknown) => {
          pushToast("error", error instanceof Error ? error.message : "command failed");
        });
    };
    switch (id) {
      case "enter-edit":     setMode("edit"); return true;
      case "exit-edit":      setMode("select"); return true;
      case "insert-sibling": surface(cmd.insertSibling(ctx)); setMode("edit"); return true;
      case "duplicate":      surface(cmd.duplicateRow(ctx)); return true;
      // edit 모드 Backspace: 빈 텍스트일 때만 row 삭제. 그 외는 DOM 기본 (글자 삭제) 통과.
      case "delete-if-empty": {
        const f = focusOf(ctx);
        if (f === null) return false;
        const node = readNode(ctx.state, f);
        if (!node || node.text !== "") return false;
        surfaceResult(cmd.deleteRows(ctx), () => setMode("select"));
        return true;
      }
      case "demote":         surface(cmd.demote(ctx)); return true;
      case "promote":        surface(cmd.promote(ctx)); return true;
      case "delete":         surface(cmd.deleteRows(ctx)); return true;
      case "select-all":     cmd.selectAll(ctx); return true;
      case "focus-prev":     cmd.focusPrev(ctx); return true;
      case "focus-next":     cmd.focusNext(ctx); return true;
      case "focus-parent":   cmd.focusParent(ctx); return true;
      case "focus-first-child": cmd.focusFirstChild(ctx); return true;
      case "focus-first":    cmd.focusFirst(ctx); return true;
      case "focus-last":     cmd.focusLast(ctx); return true;
      case "extend-up":      cmd.extendSelection(ctx, "up"); return true;
      case "extend-down":    cmd.extendSelection(ctx, "down"); return true;
      case "move-up":        surface(cmd.moveUp(ctx)); return true;
      case "move-down":      surface(cmd.moveDown(ctx)); return true;
      case "copy":           surfaceResult(cmd.copy(ctx), () => pushToast("info", `Copied ${ctx.selection.selectedPointers.length || 1}`)); return true;
      case "cut":            surfaceResult(cmd.cut(ctx), () => pushToast("info", `Cut ${ctx.selection.selectedPointers.length || 1}`)); return true;
      case "paste-sibling":  surfaceResult(cmd.paste(ctx, "sibling")); return true;
      case "paste-child":    surfaceResult(cmd.paste(ctx, "child")); return true;
      case "undo":           undo(); return true;
      case "redo":           redo(); return true;
    }
  }, [ctx, mode, setMode, pushToast, undo, redo]);
}
