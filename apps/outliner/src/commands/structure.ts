// 구조 변경 commands — insert/demote/promote/move/remove.
// 모든 mutation 후 focus·selection 은 zod-crud 자동 규칙 (SPEC §5.7 / §5.8) 에 맡긴다.

import { trackPointer, type JSONPatchOperation, type JSONResult, type Pointer } from "zod-crud";
import { EMPTY_NODE } from "../schema.js";
import { parentOf, lastIndex, siblingAt, readChildren } from "../pointer-utils.js";
import { type CommandContext, targetsOf, sortDfs } from "./context.js";

export function insertSibling(ctx: CommandContext): JSONResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found", reason: "no focus" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found", reason: "root has no sibling" };
  const parent = parentOf(p);
  if (parent === null) return { ok: false, code: "path_not_found" };
  return ctx.ops.patch([{ op: "add", path: `${parent}/${idx + 1}`, value: EMPTY_NODE }]);
}

// 선택된 ROW 들을 DFS 정렬 후, 직전 ops 를 통과한 현재 위치를 trackPointer 로 따라가며
// 각각 자기 prev sibling 의 children 끝에 append 한다. 결과: Workflowy 처럼
// 모두 같은 prev sibling 아래의 형제로 들어감 (top-down 처리 + applyPatch 정규화 덕).
export function demote(ctx: CommandContext): JSONResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot demote root" };
  const sorted = sortDfs(ctx, targets);
  const ops: JSONPatchOperation[] = [];
  for (const orig of sorted) {
    const cur = trackPointer(orig, ops);
    if (cur === null) continue;
    const idx = lastIndex(cur);
    if (idx === null || idx === 0) return { ok: false, code: "path_not_found", reason: "no previous sibling for one of selection" };
    ops.push({ op: "move", from: cur, path: `${siblingAt(cur, idx - 1)}/children/-` });
  }
  return ctx.ops.patch(ops);
}

// 선택된 row 들을 자기 부모의 다음 형제로 끌어올림. trail-siblings 모델 — promoted row
// 뒤에 있던 형제들도 promoted 의 자식으로 따라와 visual reading 순서를 보존한다.
// (Roam/Logseq 류; 글로 봤을 때 행 순서가 안 바뀜.)
export function promote(ctx: CommandContext): JSONResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot promote root" };
  const sorted = sortDfs(ctx, targets);
  const ops: JSONPatchOperation[] = [];
  for (const orig of sorted) {
    const cur = trackPointer(orig, ops);
    if (cur === null) continue;
    const segs = cur === "" ? [] : cur.slice(1).split("/");
    if (segs.length < 4) return { ok: false, code: "path_not_found", reason: "already at root level" };
    const ownerSegs = segs.slice(0, -2);
    const ownerIdx = Number(ownerSegs[ownerSegs.length - 1]);
    if (!Number.isInteger(ownerIdx)) return { ok: false, code: "path_not_found" };
    const ownerParent: Pointer = "/" + ownerSegs.slice(0, -1).join("/");
    const ownerChildrenPath: Pointer = "/" + segs.slice(0, -1).join("/");  // .../children
    const k = Number(segs[segs.length - 1]);

    // 1) row 자체 promote — owner 의 다음 sibling 자리로
    const promotedPath: Pointer = `${ownerParent}/${ownerIdx + 1}`;
    ops.push({ op: "move", from: cur, path: promotedPath });

    // 2) trail siblings — original 에서 row 뒤에 있던 형제들을 promoted 의 children 끝에 차례 append.
    //    매 trail-move 후 owner.children 의 idx 가 한 칸씩 당겨지므로 from 은 항상 /k 자리.
    //    trail 갯수 = orig 시점의 owner.children.length - origK - 1.
    const origSegs = orig.slice(1).split("/");
    const origK = Number(origSegs[origSegs.length - 1]);
    const origOwnerChildrenSegs = origSegs.slice(0, -1);  // ".../children"
    const origOwnerChildrenPath: Pointer = "/" + origOwnerChildrenSegs.join("/");
    const origChildren = readChildren(ctx.state, "/" + origOwnerChildrenSegs.slice(0, -1).join("/"));
    const trailCount = Math.max(0, origChildren.length - origK - 1);
    for (let i = 0; i < trailCount; i++) {
      ops.push({
        op: "move",
        from: `${ownerChildrenPath}/${k}` as Pointer,
        path: `${promotedPath}/children/-` as Pointer,
      });
      // origOwnerChildrenPath 는 멀티 promote 시 추적용 (현재는 단일 promote 가정)
      void origOwnerChildrenPath;
    }
  }
  return ctx.ops.patch(ops);
}

export function remove(ctx: CommandContext): JSONResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot remove root" };
  const batch: JSONPatchOperation[] = sortDfs(ctx, targets).slice().reverse().map((p) => ({ op: "remove", path: p }));
  return ctx.ops.patch(batch);
}

export function moveUp(ctx: CommandContext): JSONResult {
  const p = ctx.selection.focus;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null || idx === 0) return { ok: false, code: "path_not_found", reason: "already first" };
  return ctx.ops.patch([{ op: "move", from: p, path: siblingAt(p, idx - 1) }]);
}

export function moveDown(ctx: CommandContext): JSONResult {
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
