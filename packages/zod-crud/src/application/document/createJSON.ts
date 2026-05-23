// Headless low-level JSON state owner.

import type * as z from "zod";

import {
  applyAcceptedPatch,
  applyOperation,
  applyPatch,
  applySingleTrustedValuePatchToTrustedState,
  applyPatchToTrustedState,
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
  type JSONResult,
} from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { jsonSerializableError } from "../../foundation/json.js";
import { handleResult, type ErrorPolicy } from "../../foundation/errors.js";
import { applyPatchWithLocalSchemaValidation, schemaOutputIsKnownJson } from "../../domain/schema/localPatch.js";
import type {
  JSONChangeMetadata,
  JSONOps,
} from "./ops.js";

type JSONChangeListener = (
  applied: ReadonlyArray<JSONPatchOperation>,
  metadata?: JSONChangeMetadata,
) => void;

interface CreateJSONOptions extends ErrorPolicy {
  onChange?: () => void;
  trustedInitial?: boolean | undefined;
}

interface JSONState<T> {
  readonly value: T;
  readonly ops: TrustedJSONOps<T>;
  subscribe(listener: JSONChangeListener): () => void;
}

interface HeadlessJSONState<T> extends JSONState<T> {
  dispose(): void;
}

interface TrustedJSONOps<T> extends JSONOps<T> {
  readonly lastApplied: ReadonlyArray<JSONPatchOperation>;
  readonly stateJsonTrusted: boolean;
  previewPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  previewTrustedValuesPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  trustedPatch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  trustedApply(state: T, applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
}

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

export function createJSON<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: CreateJSONOptions = {},
): HeadlessJSONState<z.output<S>> {
  const schemaOutputJsonTrusted = schemaOutputIsKnownJson(schema);
  let state: z.output<S>;
  if (options.trustedInitial === true) {
    state = initial as z.output<S>;
  } else {
    const parsed = schema.safeParse(initial);
    if (!parsed.success) throw parsed.error;
    state = parsed.data as z.output<S>;
  }
  let stateJsonTrusted = schemaOutputJsonTrusted || jsonSerializableError(state) === null;
  const initialState = state;
  const policy: ErrorPolicy = options;
  const listeners = new Set<JSONChangeListener>();
  let lastApplied: ReadonlyArray<JSONPatchOperation> = [];
  let disposed = false;

  const notify = (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): void => {
    if (applied.length === 0 || disposed) return;
    lastApplied = applied;
    options.onChange?.();
    for (const listener of listeners) listener(applied, metadata);
  };

  const dispatch = (
    label: JSONPatchOperation | "patch",
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const before = state;
    const applied = previewPatchFrom(before, operations);
    if (!applied.result.ok) return handleResult(policy, label, applied.result);
    stateJsonTrusted = true;
    if (applied.state === before) return applied.result;
    state = applied.state;
    notify(applied.applied, metadata);
    return applied.result;
  };
  const dispatchTrusted = (
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const before = state;
    const applied = applyAcceptedPatch(before, operations);
    if (!applied.result.ok) return handleResult(policy, "patch", applied.result);
    if (applied.state === before) return applied.result;
    state = applied.state;
    if (!stateJsonTrusted) stateJsonTrusted = schemaOutputJsonTrusted || jsonSerializableError(state) === null;
    notify(applied.applied, metadata);
    return applied.result;
  };
  const applyTrustedState = (
    next: z.output<S>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    if (next === state) return { ok: true };
    state = next;
    stateJsonTrusted = true;
    notify(applied, metadata);
    return { ok: true };
  };
  const previewPatchFrom = (
    from: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
  ): ApplyResult<S> => {
    if (!stateJsonTrusted) return applyPatch(schema, from, operations);
    return applyPatchWithLocalSchemaValidation(schema, from, operations)
      ?? applyPatchToTrustedState(schema, from, operations);
  };
  const previewTrustedValuesPatchFrom = (
    from: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
  ): ApplyResult<S> => {
    if (!stateJsonTrusted) return applyPatch(schema, from, operations);
    return applyPatchWithLocalSchemaValidation(schema, from, operations, { valuesTrusted: true })
      ?? applySingleTrustedValuePatchToTrustedState(schema, from, operations)
      ?? applyPatchToTrustedState(schema, from, operations);
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
    stateJsonTrusted = schemaOutputJsonTrusted || jsonSerializableError(state) === null;
    notify([ROOT_REPLACE(state)]);
    return { ok: true };
  };

  const ops: TrustedJSONOps<z.output<S>> = {
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
    patch(operations, metadata) {
      return dispatch("patch", operations, metadata);
    },
    previewPatch(operations) {
      return previewPatchFrom(state, operations);
    },
    previewTrustedValuesPatch(operations) {
      return previewTrustedValuesPatchFrom(state, operations);
    },
    trustedPatch(operations, metadata) {
      return dispatchTrusted(operations, metadata);
    },
    trustedApply(next, applied, metadata) {
      return applyTrustedState(next, applied, metadata);
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
    get lastApplied() { return lastApplied; },
    get stateJsonTrusted() { return stateJsonTrusted; },
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
