// 구조 변경 commands — insert/demote/promote/move/remove.
// 모든 mutation 후 focus·selection 은 zod-crud 자동 규칙 (SPEC §5.7 / §5.8) 에 맡긴다.

import type { JsonPatchOperation, JsonResult } from "zod-crud";
import { EMPTY_NODE } from "../schema.js";
import { parentOf, lastIndex, siblingAt, readChildren } from "../pointer-utils.js";
import { type CommandContext, targetsOf, sortDfs } from "./context.js";

export function insertSibling(ctx: CommandContext): JsonResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found", reason: "no focus" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found", reason: "root has no sibling" };
  const parent = parentOf(p);
  if (parent === null) return { ok: false, code: "path_not_found" };
  return ctx.ops.patch([{ op: "add", path: `${parent}/${idx + 1}`, value: EMPTY_NODE }]);
}

export function demote(ctx: CommandContext): JsonResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null || idx === 0) return { ok: false, code: "path_not_found", reason: "no previous sibling" };
  const target = `${siblingAt(p, idx - 1)}/children/-`;
  return ctx.ops.patch([{ op: "move", from: p, path: target }]);
}

// row 를 자기 부모의 sibling 으로 끌어올림. path 형태: /children/i/.../children/k.
// 마지막 2 segment ("children", index) 를 떼면 row 의 부모 OutlineNode pointer.
export function promote(ctx: CommandContext): JsonResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found" };
  const segs = p === "" ? [] : p.slice(1).split("/");
  if (segs.length < 4) return { ok: false, code: "path_not_found", reason: "already at root level" };
  const ownerSegs = segs.slice(0, -2);
  const ownerIdx = Number(ownerSegs[ownerSegs.length - 1]);
  if (!Number.isInteger(ownerIdx)) return { ok: false, code: "path_not_found" };
  const ownerParent = "/" + ownerSegs.slice(0, -1).join("/");
  return ctx.ops.patch([{ op: "move", from: p, path: `${ownerParent}/${ownerIdx + 1}` }]);
}

export function remove(ctx: CommandContext): JsonResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot remove root" };
  const batch: JsonPatchOperation[] = sortDfs(ctx, targets).slice().reverse().map((p) => ({ op: "remove", path: p }));
  return ctx.ops.patch(batch);
}

export function moveUp(ctx: CommandContext): JsonResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null || idx === 0) return { ok: false, code: "path_not_found", reason: "already first" };
  return ctx.ops.patch([{ op: "move", from: p, path: siblingAt(p, idx - 1) }]);
}

export function moveDown(ctx: CommandContext): JsonResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found" };
  const segs = p.slice(1).split("/");
  const ownerPath = "/" + segs.slice(0, -2).join("/");
  const owner = ownerPath === "/" ? "" : ownerPath;
  if (idx >= readChildren(ctx.state, owner).length - 1) {
    return { ok: false, code: "path_not_found", reason: "already last" };
  }
  return ctx.ops.patch([{ op: "move", from: p, path: siblingAt(p, idx + 1) }]);
}
