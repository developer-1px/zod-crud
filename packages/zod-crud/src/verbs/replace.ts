// verbs/replace — Edit 기둥. find ⊗ RFC 6902 replace. multi-pointer batch, atomic.
// (schema, state, jsonpath, value) → { next, patch }.
// 단일 history commit 으로 전체 replace — undo 한 번에 전체 되돌림.

import type * as z from "zod";
import type { JsonPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { preFlight } from "../core/schema/preFlight.js";
import { find } from "./find.js";

export interface ReplaceOk<T> {
  ok: true;
  next: T;
  patch: JsonPatchOperation[];
  pointers: Pointer[];
}

export interface ReplaceError {
  ok: false;
  code: string;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export function replace<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  jsonpath: string,
  value: unknown,
): ReplaceOk<z.output<S>> | ReplaceError {
  const f = find(state, jsonpath);
  if (!f.ok) return { ok: false, code: f.code, message: f.message };
  if (f.pointers.length === 0) {
    return { ok: false, code: "empty_match", message: `no matches for ${jsonpath}` };
  }
  // multi-pointer: 모든 매칭에 RFC 6902 replace op 적용. 한 batch 로 atomic.
  // 깊은 path 부터 적용하여 얕은 path 변경이 깊은 path 를 invalidate 하지 않도록.
  const sorted = [...f.pointers].sort((a, b) => b.length - a.length);
  const patch: JsonPatchOperation[] = sorted.map((p) => ({ op: "replace", path: p, value }));
  const r = preFlight(schema, state, patch);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch, pointers: f.pointers };
}
