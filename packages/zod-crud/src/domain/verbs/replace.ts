// verbs/replace — Edit 기둥. find ⊗ RFC 6902 replace. multi-pointer batch, atomic.
// (schema, state, jsonpath, value) → { next, patch }.
// 단일 history commit 으로 전체 replace — undo 한 번에 전체 되돌림.

import type * as z from "zod";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { preFlight, type PreFlightErrorCode } from "../schema/preFlight.js";
// note: verbs/* 끼리 import 금지 (lint rule). 여기서는 jsonpath 의 query 를 직접 호출.
import { query as jsonpathQuery } from "../../foundation/jsonpath/index.js";
import { JSONPathSyntaxError } from "../../foundation/jsonpath/index.js";

export interface ReplaceOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  pointers: Pointer[];
}

export interface ReplaceError {
  ok: false;
  code: "syntax_error" | "empty_match" | PreFlightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export function replace<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  jsonpath: string,
  value: unknown,
): ReplaceOk<z.output<S>> | ReplaceError {
  let pointers: Pointer[];
  try {
    pointers = jsonpathQuery(jsonpath, state);
  } catch (e) {
    if (e instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", message: e.message };
    }
    throw e;
  }
  if (pointers.length === 0) {
    return { ok: false, code: "empty_match", message: `no matches for ${jsonpath}` };
  }
  // multi-pointer: 모든 매칭에 RFC 6902 replace op 적용. 한 batch 로 atomic.
  // 깊은 path 부터 적용하여 얕은 path 변경이 깊은 path 를 invalidate 하지 않도록.
  const sorted = [...pointers].sort((a, b) => b.length - a.length);
  const patch: JSONPatchOperation[] = sorted.map((p) => ({ op: "replace", path: p, value }));
  const r = preFlight(schema, state, patch);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch, pointers };
}
