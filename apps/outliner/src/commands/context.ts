// Command 들이 공유하는 ctx 형식 + 공용 헬퍼.

import type { JSONDocument, JSONPoint, Pointer, SelectionState } from "zod-crud";
import type { OutlineNode } from "../schema.js";
import type { ClipboardApi } from "../clipboard.js";
import { comparePointer } from "../pointer-utils.js";

export interface CommandContext {
  state: OutlineNode;
  document: Pick<JSONDocument<OutlineNode>, "patch" | "duplicate">;
  selection: SelectionState;
  clipboard: ClipboardApi;
}

export function pointerOf(point: JSONPoint | null | undefined): Pointer | null {
  if (point == null) return null;
  return typeof point === "string" ? point : point.path;
}

export function focusOf(ctx: CommandContext): Pointer | null {
  return pointerOf(ctx.selection.focus);
}

export function anchorOf(ctx: CommandContext): Pointer | null {
  return pointerOf(ctx.selection.anchor);
}

// 현재 동작 대상 — multi-select 가 비어있으면 focus 단일 사용.
export function targetsOf(ctx: CommandContext): Pointer[] {
  if (ctx.selection.selectedPointers.length > 0) return [...ctx.selection.selectedPointers];
  const focus = focusOf(ctx);
  if (focus !== null) return [focus];
  return [];
}

// DFS 순서로 정렬 (multi-op 적용 시 인덱스 충돌 회피).
export function sortDfs(ctx: CommandContext, ps: Pointer[]): Pointer[] {
  return [...ps].sort((a, b) => comparePointer(ctx.state, a, b));
}
