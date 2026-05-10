// verbs/undo — Undo 기둥, RFC 6902 inverse + history.back.
// pure composer. core/history/stack + core/patch wrapping.

import { applyPatch, type JsonPatchOperation } from "../core/patch/index.js";
import { back as historyBack, type HistoryStack } from "../core/history/stack.js";
import type * as z from "zod";

export interface UndoEntry {
  forward: JsonPatchOperation[];
  inverse: JsonPatchOperation[];
}

export interface UndoResult<T, E extends UndoEntry> {
  ok: true;
  next: T;
  patch: JsonPatchOperation[];
  nextStack: HistoryStack<E>;
  entry: E;
}

export interface UndoNoop {
  ok: false;
  reason: "empty_stack" | "apply_failed";
}

/**
 * undo 합성. (history stack, schema, state) → { next, patch=inverse, nextStack, entry }.
 * 스택이 비어있으면 empty_stack. inverse 적용이 실패하면 apply_failed (스택 unchanged).
 */
export function undo<S extends z.ZodType, E extends UndoEntry>(
  schema: S,
  state: z.output<S>,
  stack: HistoryStack<E>,
): UndoResult<z.output<S>, E> | UndoNoop {
  const popped = historyBack(stack);
  if (!popped) return { ok: false, reason: "empty_stack" };
  const r = applyPatch(schema, state, popped.entry.inverse);
  if (!r.result.ok) return { ok: false, reason: "apply_failed" };
  return {
    ok: true,
    next: r.state,
    patch: popped.entry.inverse,
    nextStack: popped.next,
    entry: popped.entry,
  };
}
