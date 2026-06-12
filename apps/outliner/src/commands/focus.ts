// Focus navigation — DFS visible order 위에서 좌표 이동만 (state 미변경).

import type { Pointer } from "@interactive-os/json-document";
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

function parentRowOf(ctx: CommandContext, pointer: Pointer): Pointer | null {
  let parent = parentOf(pointer);
  while (parent !== null) {
    const kind = parent === "" ? null : ctx.document.schema.kind(parent);
    if (kind?.ok && kind.kind === "object") return parent;
    parent = parentOf(parent);
  }
  return null;
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
    return parentRowOf(ctx, f);
  });
