// Selection commands — select-all, range 확장.

import type { Pointer } from "zod-crud";
import { walkPointers, prevVisible, nextVisible } from "../pointer-utils.js";
import { type CommandContext } from "./context.js";

export function selectAll(ctx: CommandContext): void {
  const all: Pointer[] = [];
  for (const p of walkPointers(ctx.state)) if (p !== "") all.push(p);
  ctx.selection.set(all);
}

// extend selection by visible(DFS) order — 형제 경계를 넘어 같은 위계 trail 로 펼침.
export function extendSelection(ctx: CommandContext, dir: "up" | "down"): void {
  const f = ctx.focus.value;
  if (f === null) return;
  const target = dir === "up" ? prevVisible(ctx.state, f) : nextVisible(ctx.state, f);
  if (!target) return;
  ctx.selection.range(ctx.selection.anchor ?? f, target);
  ctx.focus.set(target);
}
