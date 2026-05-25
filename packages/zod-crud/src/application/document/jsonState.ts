// Headless low-level JSON state owner.

import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  applySingleTrustedValuePatchToTrustedState,
  applyPatchToTrustedState,
} from "../../foundation/json-patch/applyPublic.js";
import { applyAcceptedPatch } from "../../foundation/json-patch/applyTrusted.js";
import type {
  ApplyResult,
  JSONPatchOperation,
  JSONResult,
} from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import { jsonSerializableError } from "../../foundation/jsonSerializable.js";
import { handleResult, type ErrorPolicy } from "../../foundation/errors.js";
import { schemaOutputIsKnownJson } from "../../domain/schema/localSchemaInfo.js";
import { applyPatchWithLocalSchemaValidation } from "../../domain/schema/localSchemaValidationCore.js";
import type {
  JSONChangeMetadata,
  JSONStateOps,
} from "./stateOps.js";
import {
  planJSONNotification,
  planJSONRootReplacementParse,
  planJSONStateCommit,
} from "./jsonStatePlan.js";

type JSONChangeListener = (
  applied: ReadonlyArray<JSONPatchOperation>,
  metadata?: JSONChangeMetadata,
) => void;

interface CreateJSONStateOptions extends ErrorPolicy {
  onChange?: () => void;
  trustedInitial?: boolean | undefined;
}

interface JSONState<T> {
  readonly value: T;
  readonly ops: TrustedJSONStateOps<T>;
  subscribe(listener: JSONChangeListener): () => void;
}

interface HeadlessJSONState<T> extends JSONState<T> {
  dispose(): void;
}

interface TrustedJSONStateOps<T> extends JSONStateOps<T> {
  readonly lastApplied: ReadonlyArray<JSONPatchOperation>;
  readonly stateJsonTrusted: boolean;
  previewPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  previewTrustedValuesPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  applyTrustedPatch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  trustedApply(state: T, applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
}

export function createJSONState<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: CreateJSONStateOptions = {},
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
    const plan = planJSONNotification({ applied, disposed });
    if (plan.lastApplied === null) return;
    lastApplied = plan.lastApplied;
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
    const plan = planJSONStateCommit({
      current: before,
      currentJsonTrusted: stateJsonTrusted,
      next: applied.state,
      result: applied.result,
      applied: applied.applied,
      unchangedStateJsonTrusted: true,
      changedStateJsonTrusted: true,
    });
    if (!plan.result.ok) return handleResult(policy, label, plan.result);
    stateJsonTrusted = plan.stateJsonTrusted;
    if (plan.notifyApplied === null) return plan.result;
    state = plan.state;
    notify(plan.notifyApplied, metadata);
    return plan.result;
  };
  const dispatchTrusted = (
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const before = state;
    const applied = applyAcceptedPatch(before, operations);
    const plan = planJSONStateCommit({
      current: before,
      currentJsonTrusted: stateJsonTrusted,
      next: applied.state,
      result: applied.result,
      applied: applied.applied,
      changedStateJsonTrusted: stateJsonTrusted
        ? true
        : schemaOutputJsonTrusted || jsonSerializableError(applied.state) === null,
    });
    if (!plan.result.ok) return handleResult(policy, "patch", plan.result);
    stateJsonTrusted = plan.stateJsonTrusted;
    if (plan.notifyApplied === null) return plan.result;
    state = plan.state;
    notify(plan.notifyApplied, metadata);
    return plan.result;
  };
  const applyTrustedState = (
    next: z.output<S>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const plan = planJSONStateCommit({
      current: state,
      currentJsonTrusted: stateJsonTrusted,
      next,
      result: { ok: true },
      applied,
      changedStateJsonTrusted: true,
    });
    stateJsonTrusted = plan.stateJsonTrusted;
    if (plan.notifyApplied === null) return plan.result;
    state = plan.state;
    notify(plan.notifyApplied, metadata);
    return plan.result;
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
    const plan = planJSONRootReplacementParse({
      result: schema.safeParse(value),
      schemaOutputJsonTrusted,
    });
    if (plan.kind === "error") return handleResult(policy, label, plan.result);
    state = plan.state;
    stateJsonTrusted = plan.stateJsonTrusted;
    notify(plan.notifyApplied);
    return plan.result;
  };

  const ops: TrustedJSONStateOps<z.output<S>> = {
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
    applyTrustedPatch(operations, metadata) {
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
