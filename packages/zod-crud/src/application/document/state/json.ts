// Headless low-level JSON state owner.

import type * as z from "zod";

import {
  applyOperation,
  applyPatch,
  applySingleTrustedValuePatchToTrustedState,
  applyPatchToTrustedState as applyPatchToTrustedStateCore,
} from "../../../foundation/patch/schema.js";
import { applyAcceptedPatch } from "../../../foundation/patch/trusted.js";
import type {
  ApplyResult,
  JSONPatchOperation,
  JSONResult,
} from "../../../foundation/patch/types.js";
import { jsonSerializableError } from "../../../foundation/json/serializable.js";
import { handleResult, type ErrorPolicy } from "../../../foundation/error.js";
import { schemaOutputIsKnownJson } from "../../../domain/schema/shared/schema.js";
import {
  applyPatchToTrustedState,
  applyPatchWithLocalSchemaValidation,
} from "../../../domain/schema/validation/patch.js";
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

interface TrustedJSONStateOps<T> extends JSONStateOps<T> {
  readonly lastApplied: ReadonlyArray<JSONPatchOperation>;
  readonly stateJsonTrusted: boolean;
  previewPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  previewTrustedValuesPatch(operations: ReadonlyArray<JSONPatchOperation>): ApplyResult<z.ZodTypeAny> & { state: T };
  applyTrustedPatch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
  trustedApply(state: T, applied: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;
}

const ROOT_REPLACE = (value: unknown): JSONPatchOperation => ({ op: "replace", path: "", value });

export function createJSONState<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: CreateJSONStateOptions = {},
): TrustedJSONStateOps<z.output<S>> {
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

  const notify = (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): void => {
    if (applied.length === 0) return;
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
    stateJsonTrusted = stateJsonTrusted
      ? true
      : schemaOutputJsonTrusted || jsonSerializableError(applied.state) === null;
    state = applied.state;
    notify(applied.applied, metadata);
    return applied.result;
  };
  const applyTrustedState = (
    next: z.output<S>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    if (next === state) return { ok: true };
    stateJsonTrusted = true;
    state = next;
    notify(applied, metadata);
    return { ok: true };
  };
  const previewPatchFrom = (
    from: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
  ): ApplyResult<S> => {
    if (!stateJsonTrusted) return applyPatch(schema, from, operations);
    return applyPatchToTrustedState(schema, from, operations);
  };
  const previewTrustedValuesPatchFrom = (
    from: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
  ): ApplyResult<S> => {
    if (!stateJsonTrusted) return applyPatch(schema, from, operations);
    return applyPatchWithLocalSchemaValidation(schema, from, operations, { valuesTrusted: true })
      ?? applySingleTrustedValuePatchToTrustedState(schema, from, operations)
      ?? applyPatchToTrustedStateCore(schema, from, operations);
  };

  const single = (operation: JSONPatchOperation): JSONResult => dispatch(operation, [operation]);

  const replaceRoot = (label: "load" | "reset", value: unknown): JSONResult => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return handleResult(policy, label, {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(parsed.error.issues),
      });
    }
    state = parsed.data as z.output<S>;
    stateJsonTrusted = schemaOutputJsonTrusted || jsonSerializableError(state) === null;
    notify([ROOT_REPLACE(state)]);
    return { ok: true };
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
    patch: (operations, metadata) => dispatch("patch", operations, metadata),
    previewPatch: (operations) => previewPatchFrom(state, operations),
    previewTrustedValuesPatch: (operations) => previewTrustedValuesPatchFrom(state, operations),
    applyTrustedPatch: (operations, metadata) => dispatchTrusted(operations, metadata),
    trustedApply: (next, applied, metadata) => applyTrustedState(next, applied, metadata),
    load: (value) => replaceRoot("load", value),
    reset: (value) => replaceRoot("reset", value ?? initialState),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get state() { return state; },
    get lastApplied() { return lastApplied; },
    get stateJsonTrusted() { return stateJsonTrusted; },
  };
  return ops;
}
