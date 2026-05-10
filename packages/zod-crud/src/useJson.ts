// SPEC.md §5.1 — 유일한 React 진입점.
// 코어는 src/core/patch.ts (pure). 이 파일은 useState + ops binding.

import { useCallback, useMemo, useRef, useState } from "react";
import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  type JsonPatchOperation,
  type JsonResult,
} from "./core/patch.js";
import type { Pointer } from "./core/pointer.js";

export interface UseJsonOptions {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
}

export interface JsonOps<T> {
  add(path: Pointer, value: unknown): JsonResult;
  remove(path: Pointer): JsonResult;
  replace(path: Pointer, value: unknown): JsonResult;
  move(from: Pointer, path: Pointer): JsonResult;
  copy(from: Pointer, path: Pointer): JsonResult;
  test(path: Pointer, value: unknown): JsonResult;

  patch(operations: ReadonlyArray<JsonPatchOperation>): JsonResult;

  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;

  load(value: T): JsonResult;
  reset(value?: T): void;
}

export class JsonCrudError extends Error {
  override readonly name = "JsonCrudError";
  constructor(
    public readonly op: JsonPatchOperation | "load" | "reset" | "patch",
    public readonly result: Extract<JsonResult, { ok: false }>,
  ) {
    super(`useJson failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
  }
}

declare const process: { env?: { NODE_ENV?: string } } | undefined;
const isProd = ((): boolean => {
  try {
    return typeof process !== "undefined" && process?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
})();

export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonOptions = {},
): [z.output<S>, JsonOps<z.output<S>>] {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [initialParsed] = useState(() => {
    const parsed = schema.safeParse(initial);
    if (!parsed.success) throw parsed.error;
    return parsed.data as z.output<S>;
  });
  const initialRef = useRef(initialParsed);

  const [state, setState] = useState<z.output<S>>(initialParsed);

  // History — opt-in. forward stack: 적용된 op + inverse. RFC 6902 op 그대로 저장.
  const historyLimit = options.history ?? 0;
  const undoStackRef = useRef<JsonPatchOperation[][]>([]);
  const redoStackRef = useRef<JsonPatchOperation[][]>([]);

  const handle = useCallback(
    (op: JsonPatchOperation | "load" | "reset" | "patch", result: JsonResult): JsonResult => {
      if (result.ok) return result;
      const strict = optsRef.current.strict ?? !isProd;
      if (optsRef.current.onError) {
        optsRef.current.onError(new JsonCrudError(op, result));
      }
      if (strict) {
        throw new JsonCrudError(op, result);
      }
      return result;
    },
    [],
  );

  const computeInverse = useCallback(
    (prev: z.output<S>, ops: ReadonlyArray<JsonPatchOperation>): JsonPatchOperation[] => {
      // 단순화: forward 적용 전 prev 전체를 replace로 되돌리는 단일 op로 인버스 표현.
      // RFC 6902 호환은 유지(replace at root는 표준). 미세 단위 inverse는 후속 wave에서 정밀화.
      void ops;
      return [{ op: "replace", path: "", value: prev }];
    },
    [],
  );

  const dispatch = useCallback(
    (label: JsonPatchOperation | "patch", ops: ReadonlyArray<JsonPatchOperation>): JsonResult => {
      const { state: next, result } = applyPatch(schema, state, ops);
      if (!result.ok) return handle(label, result);
      if (next === state) return result;

      if (historyLimit > 0) {
        const inverse = computeInverse(state, ops);
        const stack = undoStackRef.current;
        stack.push(inverse);
        if (stack.length > historyLimit) stack.shift();
        redoStackRef.current = [];
      }

      setState(next);
      return result;
    },
    [schema, state, historyLimit, handle, computeInverse],
  );

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const single = (op: JsonPatchOperation): JsonResult => dispatch(op, [op]);
    return {
      add(path, value) { return single({ op: "add", path, value }); },
      remove(path) { return single({ op: "remove", path }); },
      replace(path, value) { return single({ op: "replace", path, value }); },
      move(from, path) { return single({ op: "move", from, path }); },
      copy(from, path) { return single({ op: "copy", from, path }); },
      test(path, value) {
        const r = applyOperation(schema, state, { op: "test", path, value });
        return handle({ op: "test", path, value }, r.result);
      },
      patch(operations) { return dispatch("patch", operations); },

      undo() {
        const inv = undoStackRef.current.pop();
        if (!inv) return false;
        const { state: next, result } = applyPatch(schema, state, inv);
        if (!result.ok) return false;
        // redo용: 현재 state를 redo stack에 inverse로 저장
        redoStackRef.current.push([{ op: "replace", path: "", value: state }]);
        setState(next);
        return true;
      },
      redo() {
        const inv = redoStackRef.current.pop();
        if (!inv) return false;
        const { state: next, result } = applyPatch(schema, state, inv);
        if (!result.ok) return false;
        undoStackRef.current.push([{ op: "replace", path: "", value: state }]);
        setState(next);
        return true;
      },
      canUndo() { return undoStackRef.current.length > 0; },
      canRedo() { return redoStackRef.current.length > 0; },

      load(value) {
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
          return handle("load", { ok: false, code: "schema_violation", reason: parsed.error.message });
        }
        undoStackRef.current = [];
        redoStackRef.current = [];
        setState(parsed.data as z.output<S>);
        return { ok: true };
      },
      reset(value) {
        const target = value ?? initialRef.current;
        const parsed = schema.safeParse(target);
        if (!parsed.success) {
          handle("reset", { ok: false, code: "schema_violation", reason: parsed.error.message });
          return;
        }
        undoStackRef.current = [];
        redoStackRef.current = [];
        setState(parsed.data as z.output<S>);
      },
    };
  }, [dispatch, schema, state, handle]);

  return [state, ops];
}
