import { createCollection } from "@interactive-os/json-document-collection";
import { createOutline } from "@interactive-os/json-document-outline";
import { type JSONResult, type Pointer } from "@interactive-os/json-document";
import { lastIndex, parentOf } from "../pointer-utils.js";
import { focusOf, type CommandContext, targetsOf, sortDfs } from "./context.js";

type CommandResult =
  | JSONResult
  | { ok: false; code?: string; reason?: string; message?: string; pointer?: Pointer };

export function insertSibling(ctx: CommandContext): CommandResult {
  const p = focusOf(ctx);
  if (p === null) return { ok: false, code: "path_not_found", reason: "no focus" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found", reason: "root has no sibling" };
  const parent = parentOf(p);
  if (parent === null) return { ok: false, code: "path_not_found" };
  return ctx.document.insert(`${parent}/${idx + 1}`, { text: "", children: [] });
}

export function duplicateRow(ctx: CommandContext): CommandResult {
  const p = focusOf(ctx);
  if (p === null) return { ok: false, code: "path_not_found", reason: "no focus" };
  return createCollection(ctx.document).duplicateAfter(p);
}

export function demote(ctx: CommandContext): CommandResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot demote root" };
  return createOutline(ctx.document).demote(targets);
}

export function promote(ctx: CommandContext): CommandResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot promote root" };
  return createOutline(ctx.document).promote(targets);
}

export function deleteRows(ctx: CommandContext): CommandResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot delete root" };
  return createCollection(ctx.document).deleteItems(sortDfs(ctx, targets));
}

export function moveUp(ctx: CommandContext): CommandResult {
  const p = focusOf(ctx);
  if (p === null) return { ok: false, code: "path_not_found" };
  return createCollection(ctx.document).moveUp(p);
}

export function moveDown(ctx: CommandContext): CommandResult {
  const p = focusOf(ctx);
  if (p === null) return { ok: false, code: "path_not_found" };
  return createCollection(ctx.document).moveDown(p);
}
