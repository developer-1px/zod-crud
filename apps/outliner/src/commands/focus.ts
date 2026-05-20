// Focus navigation — DFS visible order 위에서 좌표 이동만 (state 미변경).

import type { Pointer } from "zod-crud";
import type { OutlineNode } from "../schema.js";
import {
  parentOf, nextVisible, prevVisible, firstVisible, lastVisible, firstChildOf,
} from "../pointer-utils.js";
import { focusOf, type CommandContext } from "./context.js";

// 화살표 nav = 캐럿 이동 = collapsed selection. focus·selection 둘 다 [target].
function navigate(ctx: CommandContext, compute: (state: OutlineNode, f: Pointer | null) => Pointer | null) {
  const target = compute(ctx.state, focusOf(ctx));
  if (target !== null) ctx.selection.collapse(target);
}

export const focusPrev = (ctx: CommandContext) =>
  navigate(ctx, (s, f) => f === null ? lastVisible(s) : prevVisible(s, f));
export const focusNext = (ctx: CommandContext) =>
  navigate(ctx, (s, f) => f === null ? firstVisible(s) : nextVisible(s, f));
export const focusFirst = (ctx: CommandContext) => navigate(ctx, (s) => firstVisible(s));
export const focusLast = (ctx: CommandContext) => navigate(ctx, (s) => lastVisible(s));
export const focusFirstChild = (ctx: CommandContext) =>
  navigate(ctx, (s, f) => f === null ? firstVisible(s) : firstChildOf(s, f));
export const focusParent = (ctx: CommandContext) =>
  navigate(ctx, (_s, f) => {
    if (f === null) return null;
    const p = parentOf(f);
    // root ("") 은 편집 row 가 아님 (UI 정책) — 거기로 이동 안 함.
    return p === null || p === "" ? null : p;
  });
