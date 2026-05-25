// Headless low-level JSON state owner.

import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  applySingleTrustedValuePatchToTrustedState,
  applyPatchToTrustedState,
} from "../../../foundation/patch/schema.js";
import { applyAcceptedPatch } from "../../../foundation/patch/trusted.js";
import type {
  ApplyResult,
  JSONPatchOperation,
  JSONResult,
} from "../../../foundation/patch/types.js";
import { jsonSerializableError } from "../../../foundation/json/serializable.js";
import { handleResult, type ErrorPolicy } from "../../../foundation/error.js";
import { schemaOutputIsKnownJson } from "../../../domain/schema/validation/schema.js";
import { applyPatchWithLocalSchemaValidation } from "../../../domain/schema/validation/patch.js";
import type {
  JSONChangeMetadata,
  JSONStateOps,
} from "../runtime/types.js";

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

interface JSONStateCommitInput<T> {
  current: T;
  currentJsonTrusted: boolean;
  next: T;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
  unchangedStateJsonTrusted?: boolean;
  changedStateJsonTrusted: boolean;
}

interface JSONStateCommitPlan<T> {
  result: JSONResult;
  state: T;
  stateJsonTrusted: boolean;
  notifyApplied: ReadonlyArray<JSONPatchOperation> | null;
}

interface JSONRootReplacementInput<T> {
  next: T;
  schemaOutputJsonTrusted: boolean;
}

interface JSONRootReplacementParseInput<T> {
  result: { success: true; data: T } | { success: false; error: z.ZodError };
  schemaOutputJsonTrusted: boolean;
}

interface JSONRootReplacementPlan<T> {
  result: JSONResult;
  state: T;
  stateJsonTrusted: boolean;
  notifyApplied: ReadonlyArray<JSONPatchOperation>;
}

type JSONRootReplacementParsePlan<T> =
  | ({ kind: "replace" } & JSONRootReplacementPlan<T>)
  | { kind: "error"; result: Extract<JSONResult, { ok: false }> };

interface JSONNotificationInput {
  applied: ReadonlyArray<JSONPatchOperation>;
  disposed: boolean;
}

interface JSONNotificationPlan {
  lastApplied: ReadonlyArray<JSONPatchOperation> | null;
}

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

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
      return single({ op: "add", path, value });
    },
    remove(path) {
      return single({ op: "remove", path });
    },
    replace(path, value) {
      return single({ op: "replace", path, value });
    },
    move(from, path) {
      return single({ op: "move", from, path });
    },
    copy(from, path) {
      return single({ op: "copy", from, path });
    },
    test(path, value) {
      const op: JSONPatchOperation = { op: "test", path, value };
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

export function planJSONStateCommit<T>(
  input: JSONStateCommitInput<T>,
): JSONStateCommitPlan<T> {
  if (!input.result.ok) {
    return {
      result: input.result,
      state: input.current,
      stateJsonTrusted: input.currentJsonTrusted,
      notifyApplied: null,
    };
  }

  if (input.next === input.current) {
    return {
      result: input.result,
      state: input.current,
      stateJsonTrusted: input.unchangedStateJsonTrusted ?? input.currentJsonTrusted,
      notifyApplied: null,
    };
  }

  return {
    result: input.result,
    state: input.next,
    stateJsonTrusted: input.changedStateJsonTrusted,
    notifyApplied: input.applied,
  };
}

export function planJSONNotification(
  input: JSONNotificationInput,
): JSONNotificationPlan {
  return input.applied.length === 0 || input.disposed
    ? { lastApplied: null }
    : { lastApplied: input.applied };
}

function planJSONRootReplacement<T>(
  input: JSONRootReplacementInput<T>,
): JSONRootReplacementPlan<T> {
  return {
    result: { ok: true },
    state: input.next,
    stateJsonTrusted: input.schemaOutputJsonTrusted || jsonSerializableError(input.next) === null,
    notifyApplied: [ROOT_REPLACE(input.next)],
  };
}

export function planJSONRootReplacementParse<T>(
  input: JSONRootReplacementParseInput<T>,
): JSONRootReplacementParsePlan<T> {
  if (!input.result.success) {
    return {
      kind: "error",
      result: {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(input.result.error.issues),
      },
    };
  }
  return {
    kind: "replace",
    ...planJSONRootReplacement({
      next: input.result.data,
      schemaOutputJsonTrusted: input.schemaOutputJsonTrusted,
    }),
  };
}
