// Headless low-level JSON state owner.

import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  type JSONPatchOperation,
  type JSONResult,
} from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import { parsePointer, readAt } from "./core/pointer/index.js";
import { handleResult, JSONCrudError, type ErrorPolicy } from "./JSONCrudError.js";
import type {
  JSONChangeListener,
  JSONChangeMetadata,
  JSONOps,
  UseJSONOptions,
} from "./jsonOps.js";

export interface CreateJSONOptions extends UseJSONOptions {
  onChange?: () => void;
}

export interface JSONState<T> {
  readonly value: T;
  readonly ops: JSONOps<T>;
  subscribe(listener: JSONChangeListener): () => void;
}

export interface HeadlessJSONState<T> extends JSONState<T> {
  dispose(): void;
}

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

export function createJSON<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: CreateJSONOptions = {},
): HeadlessJSONState<z.output<S>> {
  const parsed = schema.safeParse(initial);
  if (!parsed.success) throw parsed.error;

  let state = parsed.data as z.output<S>;
  const initialState = state;
  const policy: ErrorPolicy = options;
  const listeners = new Set<JSONChangeListener>();
  let disposed = false;

  const notify = (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): void => {
    if (applied.length === 0 || disposed) return;
    options.onChange?.();
    for (const listener of listeners) listener(applied, metadata);
  };

  const dispatch = (
    label: JSONPatchOperation | "patch",
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const before = state;
    const applied = applyPatch(schema, before, operations);
    if (!applied.result.ok) return handleResult(policy, label, applied.result);
    if (applied.state === before) return applied.result;
    state = applied.state;
    notify(applied.applied, metadata);
    return applied.result;
  };

  const single = (operation: JSONPatchOperation): JSONResult => dispatch(operation, [operation]);

  const replaceRoot = (label: "load" | "reset", value: unknown): JSONResult => {
    const next = schema.safeParse(value);
    if (!next.success) {
      return handleResult(policy, label, {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(next.error.issues),
      });
    }
    state = next.data as z.output<S>;
    notify([ROOT_REPLACE(state)]);
    return { ok: true };
  };

  const ops: JSONOps<z.output<S>> = {
    add(path, value) {
      return single({ op: "add", path: path as Pointer, value });
    },
    remove(path) {
      return single({ op: "remove", path: path as Pointer });
    },
    replace(path, value) {
      return single({ op: "replace", path: path as Pointer, value });
    },
    move(from, path) {
      return single({ op: "move", from: from as Pointer, path: path as Pointer });
    },
    copy(from, path) {
      return single({ op: "copy", from: from as Pointer, path: path as Pointer });
    },
    test(path, value) {
      const op: JSONPatchOperation = { op: "test", path: path as Pointer, value };
      const result = applyOperation(schema, state, op);
      return handleResult(policy, op, result.result);
    },
    set(path, value) {
      const p = path as Pointer;
      let segments: string[];
      try {
        segments = parsePointer(p);
      } catch (error) {
        return handleResult(policy, "set", {
          ok: false,
          code: "invalid_pointer",
          reason: error instanceof Error ? error.message : "invalid JSON Pointer",
          pointer: p,
        });
      }
      const current = readAt(state, segments);
      if (value === undefined) {
        if (!current.ok) return { ok: true };
        return single({ op: "remove", path: p });
      }
      if (!current.ok) return single({ op: "add", path: p, value });
      if (current.value === value) return { ok: true };
      return single({ op: "replace", path: p, value });
    },
    patch(operations, metadata) {
      return dispatch("patch", operations, metadata);
    },
    apply(operations, metadata) {
      const result = ops.patch(operations, metadata);
      if (!result.ok) throw new JSONCrudError("patch", result);
    },
    load(value) {
      return replaceRoot("load", value);
    },
    reset(value) {
      return replaceRoot("reset", value ?? initialState);
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get state() { return state; },
  };

  return {
    get value() { return state; },
    get ops() { return ops; },
    subscribe(listener) {
      return ops.subscribe(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
