import type {
  ClipboardCopyCommandResult,
  ClipboardCutCommandResult,
  ClipboardPasteCommandResult,
  PasteMode,
} from "../clipboard.js";
import { type CommandContext, focusOf, targetsOf, sortDfs } from "./context.js";

export function copy(ctx: CommandContext): Promise<ClipboardCopyCommandResult> | void {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return;
  return ctx.clipboard.copy(sortDfs(ctx, targets));
}

export function cut(ctx: CommandContext): Promise<ClipboardCutCommandResult> | void {
  const targets = targetsOf(ctx);
  if (targets.length === 0 || targets.includes("")) return;
  return ctx.clipboard.cut(sortDfs(ctx, targets));
}

export function paste(ctx: CommandContext, mode: PasteMode): Promise<ClipboardPasteCommandResult> | ClipboardPasteCommandResult {
  return ctx.clipboard.paste(focusOf(ctx) ?? "", mode);
}
