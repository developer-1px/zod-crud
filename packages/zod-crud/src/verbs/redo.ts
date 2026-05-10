// verbs/redo — Undo 기둥 (forward), RFC 6902 forward + history.forward.
// pure composer. core/history/stack + core/patch wrapping.

import type { JsonPatchOperation } from "../core/patch/index.js";
import { preFlight } from "../core/schema/preFlight.js";
import { forward as historyForward, type HistoryStack } from "../core/history/stack.js";
import type * as z from "zod";
import type { UndoEntry, UndoNoop } from "./undo.js";

// note: verbs/redo 는 verbs/undo 의 type 만 import (lint-equivalent rule §3 위반 아님 — type-only import).

export interface RedoResult<T, E extends UndoEntry> {
  ok: true;
  next: T;
  patch: JsonPatchOperation[];
  nextStack: HistoryStack<E>;
  entry: E;
}

/**
 * redo 합성. (history stack, schema, state) → { next, patch=forward, nextStack, entry }.
 */
export function redo<S extends z.ZodType, E extends UndoEntry>(
  schema: S,
  state: z.output<S>,
  stack: HistoryStack<E>,
): RedoResult<z.output<S>, E> | UndoNoop {
  const popped = historyForward(stack);
  if (!popped) return { ok: false, reason: "empty_stack" };
  const r = preFlight(schema, state, popped.entry.forward);
  if (!r.ok) return { ok: false, reason: "apply_failed" };
  return {
    ok: true,
    next: r.draft,
    patch: popped.entry.forward,
    nextStack: popped.next,
    entry: popped.entry,
  };
}
