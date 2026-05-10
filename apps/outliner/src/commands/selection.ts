// Selection commands — select-all, range 확장. W3C Selection API 어휘.

import { walkPointers, prevVisible, nextVisible } from "../pointer-utils.js";
import { type CommandContext } from "./context.js";

export function selectAll(ctx: CommandContext): void {
  // walk DFS, addRange 누적. 같은 array 부모 안이 아니라도 multi-selection 가능.
  ctx.selection.empty();
  for (const p of walkPointers(ctx.state)) if (p !== "") ctx.selection.addRange(p);
}

// extend selection by visible(DFS) order — 형제 경계를 넘어 같은 위계 trail 로 펼침.
export function extendSelection(ctx: CommandContext, dir: "up" | "down"): void {
  const f = ctx.selection.focus;
  if (f === null) return;
  const target = dir === "up" ? prevVisible(ctx.state, f) : nextVisible(ctx.state, f);
  if (!target) return;
  ctx.selection.setBaseAndExtent(ctx.selection.anchor ?? f, target);
}
