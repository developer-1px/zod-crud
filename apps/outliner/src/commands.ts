// Command 구현 — keymap.ts 의 CommandId 1:1.
// 각 command 는 (ctx) → JsonResult 또는 void. ctx 는 실행 시점의 doc·selection·focus·clipboard 스냅샷.

import type { JsonOps, JsonPatchOperation, JsonResult, Pointer, SelectionState, FocusState } from "zod-crud";
import type { OutlineNode } from "./schema.js";
import { EMPTY_NODE } from "./schema.js";
import {
  parentOf, lastIndex, siblingAt, readNode, readChildren,
  walkPointers, comparePointer,
  nextVisible, prevVisible, firstVisible, lastVisible, firstChildOf,
} from "./pointer-utils.js";
import type { ClipboardApi, PasteMode } from "./clipboard.js";

export interface CommandContext {
  state: OutlineNode;
  ops: JsonOps<OutlineNode>;
  selection: SelectionState<OutlineNode>;
  focus: FocusState<OutlineNode>;
  clipboard: ClipboardApi;
}

// 현재 동작 대상 — multi-select 가 비어있으면 focus 단일 사용.
function targetsOf(ctx: CommandContext): Pointer[] {
  if (ctx.selection.values.length > 0) return [...ctx.selection.values];
  if (ctx.focus.value !== null) return [ctx.focus.value];
  return [];
}

// DFS 순서로 정렬 (multi-op 적용 시 인덱스 충돌 회피).
function sortDfs(ctx: CommandContext, ps: Pointer[]): Pointer[] {
  return [...ps].sort((a, b) => comparePointer(ctx.state, a, b));
}

// 모든 mutation 후 focus 는 zod-crud useFocus 의 두 자동 규칙으로 처리됨:
//   ① add/copy/move → destination 자동 포커스
//   ② 사라지면 nextSibling → prevSibling → parent 복구
// commands 는 op 만 발행하고 focus 를 명시 set 하지 않는다.

export function insertSibling(ctx: CommandContext): JsonResult {
  const p = ctx.focus.value;
  if (p === null) return { ok: false, code: "path_not_found", reason: "no focus" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found", reason: "root has no sibling" };
  const parent = parentOf(p);
  if (parent === null) return { ok: false, code: "path_not_found" };
  const insertAt = `${parent}/${idx + 1}`;
  return ctx.ops.patch([{ op: "add", path: insertAt, value: EMPTY_NODE }]);
}

export function demote(ctx: CommandContext): JsonResult {
  const p = ctx.focus.value;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null || idx === 0) {
    return { ok: false, code: "path_not_found", reason: "no previous sibling" };
  }
  const prev = siblingAt(p, idx - 1);
  const target = `${prev}/children/-`;
  return ctx.ops.patch([{ op: "move", from: p, path: target }]);
}

export function promote(ctx: CommandContext): JsonResult {
  const p = ctx.focus.value;
  if (p === null) return { ok: false, code: "path_not_found" };
  const parent = parentOf(p);
  if (parent === null || parent === "") {
    return { ok: false, code: "path_not_found", reason: "already at root level" };
  }
  const parentIdx = lastIndex(parent);
  if (parentIdx === null) return { ok: false, code: "path_not_found" };
  const parentParent = parentOf(parent);
  if (parentParent === null) return { ok: false, code: "path_not_found" };
  const target = `${parentParent}/${parentIdx + 1}`;
  return ctx.ops.patch([{ op: "move", from: p, path: target }]);
}

export function remove(ctx: CommandContext): JsonResult {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return { ok: false, code: "path_not_found", reason: "no target" };
  if (targets.includes("")) return { ok: false, code: "path_not_found", reason: "cannot remove root" };

  const sorted = sortDfs(ctx, targets);
  const batch: JsonPatchOperation[] = sorted.slice().reverse().map((p) => ({ op: "remove", path: p }));
  const r = ctx.ops.patch(batch);
  if (r.ok) ctx.selection.clear();
  return r;
}

export function selectAll(ctx: CommandContext): void {
  const all: Pointer[] = [];
  for (const p of walkPointers(ctx.state)) {
    if (p !== "") all.push(p); // root 제외
  }
  ctx.selection.set(all);
}

export function moveUp(ctx: CommandContext): JsonResult {
  const p = ctx.focus.value;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null || idx === 0) {
    return { ok: false, code: "path_not_found", reason: "already first" };
  }
  const target = siblingAt(p, idx - 1);
  return ctx.ops.patch([{ op: "move", from: p, path: target }]);
}

export function moveDown(ctx: CommandContext): JsonResult {
  const p = ctx.focus.value;
  if (p === null) return { ok: false, code: "path_not_found" };
  const idx = lastIndex(p);
  if (idx === null) return { ok: false, code: "path_not_found" };
  const parent = parentOf(p);
  if (parent === null) return { ok: false, code: "path_not_found" };
  const parentNode = readNode(ctx.state, parent);
  if (!parentNode || idx >= parentNode.children.length - 1) {
    return { ok: false, code: "path_not_found", reason: "already last" };
  }
  const target = siblingAt(p, idx + 1);
  return ctx.ops.patch([{ op: "move", from: p, path: target }]);
}

export function copy(ctx: CommandContext): void {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return;
  ctx.clipboard.copy(ctx.state, sortDfs(ctx, targets));
}

export function cut(ctx: CommandContext): void {
  const targets = targetsOf(ctx);
  if (targets.length === 0) return;
  ctx.clipboard.cut(ctx.state, sortDfs(ctx, targets));
}

export function paste(ctx: CommandContext, mode: PasteMode): JsonResult {
  const target = ctx.focus.value ?? "";
  return ctx.clipboard.paste(target, mode, ctx.ops);
}

// extend selection by visible(DFS) order — 형제 경계를 넘어 같은 위계 trail 로 펼침.
export function extendSelection(ctx: CommandContext, dir: "up" | "down"): void {
  const f = ctx.focus.value;
  if (f === null) return;
  const target = dir === "up" ? prevVisible(ctx.state, f) : nextVisible(ctx.state, f);
  if (!target) return;
  const anchor = ctx.selection.anchor ?? f;
  ctx.selection.range(anchor, target);
  ctx.focus.set(target);
}

// ── focus navigation (DFS visible order) ────────────────────────────────────

export function focusPrev(ctx: CommandContext): void {
  const f = ctx.focus.value;
  if (f === null) {
    const last = lastVisible(ctx.state);
    if (last) ctx.focus.set(last);
    return;
  }
  const target = prevVisible(ctx.state, f);
  if (target) ctx.focus.set(target);
}

export function focusNext(ctx: CommandContext): void {
  const f = ctx.focus.value;
  if (f === null) {
    const first = firstVisible(ctx.state);
    if (first) ctx.focus.set(first);
    return;
  }
  const target = nextVisible(ctx.state, f);
  if (target) ctx.focus.set(target);
}

export function focusParent(ctx: CommandContext): void {
  const f = ctx.focus.value;
  if (f === null) return;
  const parent = parentOf(f);
  // root("") 으로의 이동은 막음 — root 는 편집 row 가 아님 (UI 정책).
  if (parent === null || parent === "") return;
  ctx.focus.set(parent);
}

export function focusFirstChild(ctx: CommandContext): void {
  const f = ctx.focus.value;
  if (f === null) {
    const first = firstVisible(ctx.state);
    if (first) ctx.focus.set(first);
    return;
  }
  const child = firstChildOf(ctx.state, f);
  if (child) ctx.focus.set(child);
}

export function focusFirst(ctx: CommandContext): void {
  const first = firstVisible(ctx.state);
  if (first) ctx.focus.set(first);
}

export function focusLast(ctx: CommandContext): void {
  const last = lastVisible(ctx.state);
  if (last) ctx.focus.set(last);
}
