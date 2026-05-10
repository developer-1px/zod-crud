// Selection commands — select-all, range 확장 (DFS visible-order).

import { walkPointers, prevVisible, nextVisible, dfsRange } from "../pointer-utils.js";
import { type CommandContext } from "./context.js";

export function selectAll(ctx: CommandContext): void {
  ctx.selection.empty();
  for (const p of walkPointers(ctx.state)) if (p !== "") ctx.selection.addRange(p);
}

// Shift+↑/↓ — visible(DFS) 한 칸 이동만큼 range 확장. anchor 는 유지.
export function extendSelection(ctx: CommandContext, dir: "up" | "down"): void {
  const f = ctx.selection.focus;
  if (f === null) return;
  const target = dir === "up" ? prevVisible(ctx.state, f) : nextVisible(ctx.state, f);
  if (!target) return;
  const anchor = ctx.selection.anchor ?? f;
  const ranges = dfsRange(ctx.state, anchor, target);
  if (ranges.length > 0) ctx.selection.selectRanges(ranges, anchor, target);
  else ctx.selection.setBaseAndExtent(anchor, target);
}
