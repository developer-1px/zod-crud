// Clipboard commands — copy/cut/paste.

import type { JsonPatchOperation, JsonResult } from "zod-crud";
import type { PasteMode } from "../clipboard.js";
import { type CommandContext, targetsOf, sortDfs } from "./context.js";

export function copy(ctx: CommandContext): void {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return;
  ctx.clipboard.copy(ctx.state, sortDfs(ctx, targets));
}

export function cut(ctx: CommandContext): void {
  const targets = targetsOf(ctx);
  if (targets.length === 0 || targets.includes("")) return;
  const sorted = sortDfs(ctx, targets);
  // 1) 클립보드 mode = cut (paste 후 자동 비움 — Workflowy/Notion 표준)
  ctx.clipboard.cut(ctx.state, sorted);
  // 2) 원본 row 즉시 제거 — selection 은 자동 규칙으로 회복
  const batch: JsonPatchOperation[] = sorted.slice().reverse().map((p) => ({ op: "remove", path: p }));
  ctx.ops.patch(batch);
}

export function paste(ctx: CommandContext, mode: PasteMode): JsonResult {
  return ctx.clipboard.paste(ctx.selection.focus ?? "", mode, ctx.ops);
}
