// Selection commands — select-all, range 확장.

import { walkPointers, prevVisible, nextVisible } from "../pointer-utils.js";
import { anchorOf, focusOf, type CommandContext } from "./context.js";

export function selectAll(ctx: CommandContext): void {
  ctx.selection.empty();
  for (const p of walkPointers(ctx.state)) if (p !== "") ctx.selection.addRange(p);
}

// Shift+↑/↓ — visible(DFS) 한 칸 이동만큼 범위 확장. setBaseAndExtent 가 zod-crud 자체에서
// anchor 종류 기반 DFS 펼침을 하므로 호출자는 두 끝점만 넘기면 된다.
export function extendSelection(ctx: CommandContext, dir: "up" | "down"): void {
  const f = focusOf(ctx);
  if (f === null) return;
  const target = dir === "up" ? prevVisible(ctx.state, f) : nextVisible(ctx.state, f);
  if (!target) return;
  ctx.selection.setBaseAndExtent(anchorOf(ctx) ?? f, target);
}
