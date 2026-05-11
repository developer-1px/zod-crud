// SPEC.md §5.1 — useJsonDocument 내부 substrate.
// 코어는 src/core/patch.ts (pure). 이 파일은 useState + ops binding + Axis 2 subscribe.
// undo/redo 는 JsonOps 의 책임이 아님 — doc.commands.undo / doc.can.undo / doc.history 가 정본 위치.

import { useCallback, useMemo, useRef, useState } from "react";
import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  type JsonPatchOperation,
  type JsonResult,
} from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { parsePointer, readAt } from "../core/pointer/index.js";
import { handleResult, JsonCrudError, type ErrorPolicy } from "../JsonCrudError.js";
import type { JsonOps, UseJsonOptions, JsonChangeListener } from "../jsonOps.js";

export { JsonCrudError } from "../JsonCrudError.js";
export type { JsonOps, UseJsonOptions, JsonChangeListener } from "../jsonOps.js";

const ROOT_REPLACE = (value: unknown): JsonPatchOperation => ({ op: "replace", path: "", value });

export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonOptions = {},
): [z.output<S>, JsonOps<z.output<S>>] {
  const policyRef = useRef<ErrorPolicy>(options);
  policyRef.current = options;

  const [initialParsed] = useState(() => {
    const parsed = schema.safeParse(initial);
    if (!parsed.success) throw parsed.error;
    return parsed.data as z.output<S>;
  });
  const initialRef = useRef(initialParsed);

  const [state, setState] = useState<z.output<S>>(initialParsed);
  const stateRef = useRef(state);
  stateRef.current = state;

  const listenersRef = useRef<Set<JsonChangeListener>>(new Set());
  const notify = useCallback((applied: ReadonlyArray<JsonPatchOperation>) => {
    if (applied.length === 0) return;
    for (const fn of listenersRef.current) fn(applied);
  }, []);

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const dispatch = (label: JsonPatchOperation | "patch", list: ReadonlyArray<JsonPatchOperation>): JsonResult => {
      const before = stateRef.current;
      const { state: next, result, applied } = applyPatch(schema, before, list);
      if (!result.ok) return handleResult(policyRef.current, label, result);
      if (next === before) return result;
      stateRef.current = next;
      setState(next);
      notify(applied);
      return result;
    };
    const single = (op: JsonPatchOperation) => dispatch(op, [op]);

    const replaceRoot = (label: "load" | "reset", value: unknown): JsonResult => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        return handleResult(policyRef.current, label, {
          ok: false, code: "schema_violation", reason: parsed.error.message,
        });
      }
      const next = parsed.data as z.output<S>;
      const replaceOp = ROOT_REPLACE(next);
      stateRef.current = next;
      setState(next);
      notify([replaceOp]);
      return { ok: true };
    };

    return {
      add(path, value) { return single({ op: "add", path: path as Pointer, value }); },
      remove(path) { return single({ op: "remove", path: path as Pointer }); },
      replace(path, value) { return single({ op: "replace", path: path as Pointer, value }); },
      move(from, path) { return single({ op: "move", from: from as Pointer, path: path as Pointer }); },
      copy(from, path) { return single({ op: "copy", from: from as Pointer, path: path as Pointer }); },
      test(path, value) {
        const r = applyOperation(schema, stateRef.current, { op: "test", path: path as Pointer, value });
        return handleResult(policyRef.current, { op: "test", path: path as Pointer, value }, r.result);
      },
      set(path, value) {
        const p = path as Pointer;
        const segs = parsePointer(p);
        const cur = readAt(stateRef.current, segs);
        if (value === undefined) {
          if (!cur.ok) return { ok: true };
          return single({ op: "remove", path: p });
        }
        if (!cur.ok) return single({ op: "add", path: p, value });
        if (cur.value === value) return { ok: true };
        return single({ op: "replace", path: p, value });
      },
      patch(operations) { return dispatch("patch", operations); },
      apply(operations) {
        const r = dispatch("patch", operations);
        if (!r.ok) throw new JsonCrudError("patch", r);
      },

      load(value) { return replaceRoot("load", value); },
      reset(value) { replaceRoot("reset", value ?? initialRef.current); },

      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => { listenersRef.current.delete(listener); };
      },
      get state() { return stateRef.current; },
    };
  }, [schema, notify]);

  return [state, ops];
}
