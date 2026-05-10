// Command 들이 공유하는 ctx 형식 + 공용 헬퍼.

import type { JsonOps, Pointer, SelectionState, FocusState } from "zod-crud";
import type { OutlineNode } from "../schema.js";
import type { ClipboardApi } from "../clipboard.js";
import { comparePointer } from "../pointer-utils.js";

export interface CommandContext {
  state: OutlineNode;
  ops: JsonOps<OutlineNode>;
  selection: SelectionState<OutlineNode>;
  focus: FocusState<OutlineNode>;
  clipboard: ClipboardApi;
}

// 현재 동작 대상 — multi-select 가 비어있으면 focus 단일 사용.
export function targetsOf(ctx: CommandContext): Pointer[] {
  if (ctx.selection.ranges.length > 0) return [...ctx.selection.ranges];
  if (ctx.selection.focus !== null) return [ctx.selection.focus];
  return [];
}

// DFS 순서로 정렬 (multi-op 적용 시 인덱스 충돌 회피).
export function sortDfs(ctx: CommandContext, ps: Pointer[]): Pointer[] {
  return [...ps].sort((a, b) => comparePointer(ctx.state, a, b));
}
