import type * as z from "zod";

import {
  applyAcceptedPatch,
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
} from "../../foundation/json-patch/index.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import {
  buildPointer,
  parentPointer,
  parsePointer,
  readAt,
  type Pointer,
} from "../../foundation/json-pointer/index.js";
import { jsonSerializableError } from "../../foundation/json.js";
import {
  getArrayElement,
  getDef,
  getObjectShape,
  schemaAtPointer,
} from "./introspection.js";

type LocalPatchResult<S extends z.ZodType> = ApplyResult<S> | null;

interface LocalPatchOptions {
  valuesTrusted?: boolean;
}

interface ExtendedDef {
  type?: string;
  coerce?: boolean;
  checks?: unknown[];
  innerType?: z.ZodType;
  catchall?: z.ZodType;
  keyType?: z.ZodType;
  valueType?: z.ZodType;
  values?: unknown[];
  entries?: Record<string, unknown>;
}

interface LocalSchemaCache {
  pointerSchemas: Map<string, z.ZodType | null>;
}

type KnownJsonValueValidator = (value: unknown, seen: WeakSet<object>) => boolean;

interface ArrayFieldPath {
  arrayPath: Pointer;
  index: number;
  key: string;
}

const objectHasOwn = Object.prototype.hasOwnProperty;
const plainStructuralSchemaCache = new WeakMap<object, boolean>();
const localSchemaCaches = new WeakMap<object, LocalSchemaCache>();
const knownJsonValueValidatorCache = new WeakMap<object, KnownJsonValueValidator | null>();

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: LocalPatchOptions = {},
): LocalPatchResult<S> {
  if (!isPlainStructuralSchema(schema)) return null;
  const valuesTrusted = options.valuesTrusted === true;
  const sameArrayFieldReplace = applySameArrayFieldReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (sameArrayFieldReplace) return sameArrayFieldReplace;
  const sameArrayElementReplace = applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayElementReplace) return sameArrayElementReplace;
  const rootObjectReplace = applyRootObjectReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (rootObjectReplace) return rootObjectReplace;
  const rootRecordAdd = applyRootRecordAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (rootRecordAdd) return rootRecordAdd;
  const rootRecordRemove = applyRootRecordRemovePatchWithLocalSchemaValidation(schema, state, ops);
  if (rootRecordRemove) return rootRecordRemove;
  if (isIndependentReplacePatch(ops)) {
    return applyReplacePatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  }
  const appendOnlyAdd = applyAppendOnlyAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (appendOnlyAdd) return appendOnlyAdd;
  const increasingAdd = applyIncreasingArrayAddPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (increasingAdd) return increasingAdd;
  const arrayBatch = applySameArrayPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
  if (arrayBatch) return arrayBatch;
  return applySequentialPatchWithLocalSchemaValidation(schema, state, ops, valuesTrusted);
}

export function isPlainStructuralSchemaForLocalValidation(schema: z.ZodType): boolean {
  return isPlainStructuralSchema(schema);
}

function applyReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  const acceptedValues = valuesTrusted
    ? null
    : applyKnownJsonReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (acceptedValues) return acceptedValues;

  const applied = valuesTrusted ? applyAcceptedPatch(state, ops) : applyTrustedPatch(state, ops);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }

  for (const op of applied.applied) {
    if (op.op !== "replace") return null;
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema) return null;
    if (acceptsKnownJsonValue(valueSchema, op.value)) continue;
    const parsed = valueSchema.safeParse(op.value);
    if (!parsed.success) {
      return schemaViolation(state, op.path, parsed.error.issues);
    }
  }

  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

function applyKnownJsonReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length === 0) return null;

  const sameArrayElementReplace = applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayElementReplace) return sameArrayElementReplace;

  for (const op of ops) {
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
    ) {
      return null;
    }
    const valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
    if (!valueSchema || !acceptsKnownJsonValue(valueSchema, op.value)) return null;
  }

  const applied = applyAcceptedPatch(state, ops);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }
  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

function applyKnownJsonSameArrayElementReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  let elementSchema: z.ZodType | null = null;
  let next: unknown[] | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
    ) {
      return null;
    }

    const location = arrayElementReplaceLocation(op.path);
    if (location === null) return null;
    if (parent === null) {
      parent = location.parent;
      parentSegments = location.parentSegments;
      const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
      elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
      if (!elementSchema) return null;

      const current = readAt(state, parentSegments);
      if (!current.ok || !Array.isArray(current.value)) return null;
      next = current.value.slice();
    } else if (parent !== location.parent) {
      return null;
    }

    if (!elementSchema || !acceptsKnownJsonValue(elementSchema, op.value)) return null;
    if (next === null || location.index < 0 || location.index >= next.length) return null;
    next[location.index] = op.value;
    applied[opIndex] = op;
  }

  if (parentSegments === null || next === null) return null;
  const nextState = replaceValueAtSegments(state, parentSegments, 0, next);
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

function applySameArrayFieldReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let field: string | null = null;
  let valueSchema: z.ZodType | null = null;
  let next: unknown[] | null = null;
  const applied: JSONPatchOperation[] = [];

  for (let opIndex = 0; opIndex < ops.length; opIndex++) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return null;
    }

    const location = parseArrayFieldPath(op.path);
    if (location === null) return null;

    if (field === null) field = location.key;
    else if (field !== location.key) return null;

    if (valueSchema === null) {
      valueSchema = cachedSchemaAtPointer(schema, op.path, "value");
      if (!valueSchema) return null;
    }

    if (next === null) {
      arrayPath = location.arrayPath;
      try {
        arraySegments = parsePointer(arrayPath);
      } catch {
        return null;
      }
      const current = readAt(state, arraySegments);
      if (!current.ok || !Array.isArray(current.value)) return null;
      next = current.value.slice();
    } else if (arrayPath !== location.arrayPath) {
      return null;
    }

    if (location.index < 0 || location.index >= next.length) return null;
    const row = next[location.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
    if (!objectHasOwn.call(row, location.key)) return null;
    const valueAccepted = acceptsKnownJsonValue(valueSchema, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = valueSchema.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }

    const sourceRow = row as Record<string, unknown>;
    const replaced = { ...sourceRow };
    if (location.key === "__proto__") {
      Object.defineProperty(replaced, location.key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      replaced[location.key] = op.value;
    }
    next[location.index] = replaced;
    applied.push(op);
  }

  if (arraySegments === null || field === null || valueSchema === null || next === null) return null;
  const nextState = replaceValueAtSegments(state, arraySegments, 0, next);
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

function applyRootObjectReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  let next: Record<string, unknown> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);
  const shape = getObjectShape(schema);
  const rootDef = shape === null ? getDef(schema) as ExtendedDef : null;
  const recordValueSchema = rootDef?.type === "record" ? (rootDef.valueType ?? null) : null;

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(state, key)) return null;

    const valueSchema = shape
      ? (objectHasOwn.call(shape, key) ? (shape[key] ?? null) : null)
      : recordValueSchema;
    if (!valueSchema) return null;
    const valueAccepted = acceptsKnownJsonValue(valueSchema, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = valueSchema.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }

    if (next === null) next = { ...(state as Record<string, unknown>) };
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    applied[index] = op;
  }

  return next === null
    ? null
    : {
        state: next as z.output<S>,
        result: { ok: true },
        applied,
      };
}

function applyRootRecordRemovePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length === 0
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const rootDef = getDef(schema) as ExtendedDef;
  if (rootDef.type !== "record" || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType))) {
    return null;
  }

  let next: Record<string, unknown> | null = null;
  let seenKeys: Set<string> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (!objectHasOwn.call(state, key)) return null;
    if (seenKeys === null) seenKeys = new Set();
    else if (seenKeys.has(key)) return null;
    seenKeys.add(key);

    if (next === null) next = { ...(state as Record<string, unknown>) };
    delete next[key];
    applied[index] = op;
  }

  return next === null
    ? null
    : {
        state: next as z.output<S>,
        result: { ok: true },
        applied,
      };
}

function applyRootRecordAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (
    !Array.isArray(ops)
    || ops.length === 0
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const rootDef = getDef(schema) as ExtendedDef;
  if (
    rootDef.type !== "record"
    || (rootDef.keyType && !isPlainStringKeySchema(rootDef.keyType))
    || !rootDef.valueType
  ) {
    return null;
  }

  let next: Record<string, unknown> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const valueAccepted = acceptsKnownJsonValue(rootDef.valueType, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const result = rootDef.valueType.safeParse(op.value);
      if (!result.success) return schemaViolation(state, op.path, result.error.issues);
    }

    const key = op.path.slice(1);
    if (next === null) next = { ...(state as Record<string, unknown>) };
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    applied[index] = op;
  }

  return next === null
    ? null
    : {
        state: next as z.output<S>,
        result: { ok: true },
        applied,
      };
}

function applySequentialPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length === 0) return null;

  let cur: unknown = state;
  const appliedOps: JSONPatchOperation[] = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isSupportedLocalOpCandidate(op)) return null;

    const sourceValue = sourceValueForValidation(cur, op);
    const applied = valuesTrusted ? applyAcceptedPatch(cur, [op]) : applyTrustedPatch(cur, [op]);
    if (!applied.result.ok) {
      return {
        state,
        result: applied.result,
        applied: [],
      };
    }

    const appliedOp = applied.applied[0];
    if (!appliedOp) return null;
    const validation = validateAppliedLocalOp(schema, state, appliedOp, sourceValue);
    if (validation === null || !validation.result.ok) return validation;
    cur = applied.state;
    appliedOps.push(appliedOp);
  }

  return {
    state: cur as z.output<S>,
    result: { ok: true },
    applied: appliedOps,
  };
}

function applyAppendOnlyAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let parent: Pointer | null = null;
  const values = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || !op.path.endsWith("/-")
    ) {
      return null;
    }

    const nextParent = op.path.slice(0, -2);
    if (parent === null) parent = nextParent;
    else if (parent !== nextParent) return null;
    values[index] = op.value;
  }

  if (parent === null) return null;
  let parentSegments: string[];
  try {
    parentSegments = parsePointer(parent);
  } catch {
    return null;
  }

  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  const elementSchema = parentSchema ? getArrayElement(parentSchema) : null;
  if (!elementSchema) return null;

  const current = readAt(state, parentSegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  const initialLength = current.value.length;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const valueAccepted = acceptsKnownJsonValue(elementSchema, value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(value);
      if (!parsed.success) return schemaViolation(state, appendArrayIndexPath(parent, initialLength + index), parsed.error.issues);
    }
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(parent, initialLength + index),
      value,
    };
  }

  const nextState = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    current.value.concat(values),
  );
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

function applyIncreasingArrayAddPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length < 2) return null;

  const first = ops[0];
  if (
    first === undefined
    || validateOperationShape(first) !== null
    || first.op !== "add"
    || typeof first.path !== "string"
    || first.path.endsWith("/-")
  ) {
    return null;
  }

  const firstLocation = arrayLocation(schema, first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;

  const parent = firstLocation.parent;
  const elementSchema = firstLocation.element;
  const start = firstLocation.index;
  let parentSegments: string[];
  try {
    parentSegments = parsePointer(parent);
  } catch {
    return null;
  }

  const current = readAt(state, parentSegments);
  if (!current.ok || !Array.isArray(current.value)) return null;
  if (start < 0 || start > current.value.length) return null;

  const values = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path.endsWith("/-")
    ) {
      return null;
    }

    const location = index === 0
      ? { index: start }
      : arrayIndexInParent(op.path, parent);
    if (location === null || location.index === "-" || location.index !== start + index) return null;

    const valueAccepted = acceptsKnownJsonValue(elementSchema, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(op.value);
      if (!parsed.success) return schemaViolation(state, op.path, parsed.error.issues);
    }
    values[index] = op.value;
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(parent, start + index),
      value: op.value,
    };
  }

  const nextState = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    start === current.value.length
      ? current.value.concat(values)
      : current.value.slice(0, start).concat(values, current.value.slice(start)),
  );
  if (nextState === null) return null;
  return {
    state: nextState as z.output<S>,
    result: { ok: true },
    applied,
  };
}

function applySameArrayPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length < 1) return null;

  let parent: Pointer | null = null;
  let elementSchema: z.ZodType | null = null;
  const parsedOps: Array<
    | { op: "add"; path: Pointer; index: number | "-"; value: unknown }
    | { op: "remove"; path: Pointer; index: number }
    | { op: "copy"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
    | { op: "move"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
  > = [];

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || (
        op.op !== "add"
        && op.op !== "remove"
        && op.op !== "copy"
        && op.op !== "move"
      )
      || typeof op.path !== "string"
    ) {
      return null;
    }
    let pathIndex: number | "-";
    if (parent === null) {
      const location = arrayLocation(schema, op.path);
      if (!location) return null;
      parent = location.parent;
      elementSchema = location.element;
      pathIndex = location.index;
    } else {
      const location = arrayIndexInParent(op.path, parent);
      if (!location) return null;
      pathIndex = location.index;
    }
    if (op.op === "add") {
      parsedOps.push({ op: "add", path: op.path, index: pathIndex, value: op.value });
    } else if (op.op === "remove") {
      if (pathIndex === "-") return null;
      parsedOps.push({ op: "remove", path: op.path, index: pathIndex });
    } else {
      const parentPath = parent;
      if (parentPath === null) return null;
      const fromLocation = arrayIndexInParent(op.from, parentPath);
      if (
        !fromLocation
        || fromLocation.index === "-"
      ) {
        return null;
      }
      parsedOps.push({
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: pathIndex,
      });
    }
  }

  if (parent === null || elementSchema === null) return null;

  for (const op of parsedOps) {
    if (op.op !== "add") continue;
    const valueAccepted = acceptsKnownJsonValue(elementSchema, op.value);
    if (!valueAccepted && !valuesTrusted) {
      const jsonError = jsonSerializableError(op.value);
      if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    }
    if (!valueAccepted) {
      const parsed = elementSchema.safeParse(op.value);
      if (!parsed.success) return schemaViolation(state, op.path, parsed.error.issues);
    }
  }

  const applied = applyTrustedPatch(state, ops, { valuesTrusted: true });
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }
  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

function validateAppliedLocalOp<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  sourceValue: { ok: true; value: unknown } | { ok: false },
): LocalPatchResult<S> {
  switch (appliedOp.op) {
    case "replace": {
      if (appliedOp.path === "") return null;
      const valueSchema = cachedSchemaAtPointer(schema, appliedOp.path, "value");
      if (!valueSchema) return null;
      const parsed = valueSchema.safeParse(appliedOp.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "add": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element) return null;
      const parsed = element.safeParse(appliedOp.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "remove":
      return arrayElementSchemaAtPath(schema, appliedOp.path)
        ? okLocalPatch(state, [appliedOp])
        : null;
    case "copy": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element || !sourceValue.ok) return null;
      const parsed = element.safeParse(sourceValue.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    case "move": {
      const element = arrayElementSchemaAtPath(schema, appliedOp.path);
      if (!element || !sourceValue.ok || !arrayElementSchemaAtPath(schema, appliedOp.from)) return null;
      const parsed = element.safeParse(sourceValue.value);
      return parsed.success
        ? okLocalPatch(state, [appliedOp])
        : schemaViolation(state, appliedOp.path, parsed.error.issues);
    }
    default:
      return null;
  }
}

function isSupportedLocalOpCandidate(op: JSONPatchOperation): boolean {
  return !!op
    && typeof op === "object"
    && validateOperationShape(op) === null
    && (
      op.op === "replace"
      || op.op === "add"
      || op.op === "remove"
      || op.op === "copy"
      || op.op === "move"
    )
    && typeof op.path === "string";
}

function arrayLocation(
  schema: z.ZodType,
  path: Pointer,
): { parent: Pointer; element: z.ZodType; index: number | "-" } | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  if (index === null) return null;
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  const element = parentSchema ? getArrayElement(parentSchema) : null;
  return element ? { parent, element, index } : null;
}

function arrayIndexInParent(path: Pointer, parent: Pointer): { index: number | "-" } | null {
  if (parentPointer(path) !== parent) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { index };
}

function arrayElementReplaceLocation(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number } | null {
  const simple = parseSimpleArrayElementReplacePath(path);
  if (simple !== null) return simple;

  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = numericSegment(segment);
  if (index === null) return null;
  return { parent, parentSegments: segments.slice(0, -1), index };
}

function parseSimpleArrayElementReplacePath(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1));
  if (index === null) return null;

  const parent = path.slice(0, indexSlash);
  return {
    parent,
    parentSegments: parent === "" ? [] : parent.slice(1).split("/"),
    index,
  };
}

function isIndependentReplacePatch(ops: ReadonlyArray<JSONPatchOperation>): boolean {
  if (!Array.isArray(ops) || ops.length === 0) return false;
  const paths: string[] = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return false;
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return false;
    }
    try {
      const segments = parsePointer(op.path);
      if (segments.includes("-")) return false;
    } catch {
      return false;
    }
    paths.push(op.path);
  }

  const sorted = [...paths].sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return false;
  }
  return true;
}

function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 2) return null;
  const index = numericSegment(segments[segments.length - 2]!);
  return index === null
    ? null
    : {
        arrayPath: buildPointer(segments.slice(0, -2)),
        index,
        key: segments[segments.length - 1]!,
      };
}

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  if (index === null) return null;

  return { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function arrayElementSchemaAtPath(schema: z.ZodType, path: Pointer): z.ZodType | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  return parentSchema ? getArrayElement(parentSchema) : null;
}

function sourceValueForValidation(
  state: unknown,
  op: JSONPatchOperation,
): { ok: true; value: unknown } | { ok: false } {
  if (op.op !== "copy" && op.op !== "move") return { ok: false };
  try {
    return readAt(state, parsePointer(op.from));
  } catch {
    return { ok: false };
  }
}

function replaceValueAtSegments(
  current: unknown,
  segments: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown | null {
  if (index === segments.length) return value;
  if (current === null || typeof current !== "object") return null;

  const segment = segments[index]!;
  if (Array.isArray(current)) {
    const childIndex = numericSegment(segment);
    if (childIndex === null || childIndex >= current.length) return null;
    const child = replaceValueAtSegments(current[childIndex], segments, index + 1, value);
    if (child === null) return null;
    const next = current.slice();
    next[childIndex] = child;
    return next;
  }

  if (!objectHasOwn.call(current, segment)) return null;
  const child = replaceValueAtSegments(
    (current as Record<string, unknown>)[segment],
    segments,
    index + 1,
    value,
  );
  if (child === null) return null;
  return { ...(current as Record<string, unknown>), [segment]: child };
}

function acceptsKnownJsonValue(schema: z.ZodType, value: unknown): boolean {
  const validator = knownJsonValueValidatorForSchema(schema);
  return validator !== null && validator(value, new WeakSet<object>());
}

function knownJsonValueValidatorForSchema(schema: z.ZodType): KnownJsonValueValidator | null {
  const cached = knownJsonValueValidatorCache.get(schema as object);
  if (cached !== undefined) return cached;
  const validator = buildKnownJsonValueValidator(schema, new WeakSet<object>());
  knownJsonValueValidatorCache.set(schema as object, validator);
  return validator;
}

function buildKnownJsonValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (seenSchemas.has(schema as object)) return null;
  seenSchemas.add(schema as object);
  const validator = buildKnownJsonValueValidatorUnchecked(schema, seenSchemas);
  seenSchemas.delete(schema as object);
  return validator;
}

function buildKnownJsonValueValidatorUnchecked(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const def = getDef(schema) as ExtendedDef;
  if (def.coerce || (Array.isArray(def.checks) && def.checks.length > 0)) return null;

  switch (def.type) {
    case "string":
      return (value) => typeof value === "string";
    case "number":
      return (value) => typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return (value) => typeof value === "boolean";
    case "null":
      return (value) => value === null;
    case "literal":
      return buildLiteralValueValidator(def);
    case "enum":
      return buildEnumValueValidator(def);
    case "optional": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value !== undefined && inner(value, seen);
    }
    case "nullable": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value === null || inner(value, seen);
    }
    case "object":
      return buildObjectValueValidator(schema, def, seenSchemas);
    case "array":
      return buildArrayValueValidator(schema, seenSchemas);
    case "record":
      return buildRecordValueValidator(def, seenSchemas);
    default:
      return null;
  }
}

function buildObjectValueValidator(
  schema: z.ZodType,
  def: ExtendedDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.catchall) return null;
  const shape = getObjectShape(schema);
  if (!shape) return null;

  const fields: Array<{ key: string; optional: boolean; validate: KnownJsonValueValidator }> = [];
  for (const key of Object.keys(shape)) {
    const childSchema = shape[key];
    if (!childSchema) return null;
    const validate = buildKnownJsonValueValidator(childSchema, seenSchemas);
    if (validate === null) return null;
    fields.push({
      key,
      optional: isOptionalSchema(childSchema),
      validate,
    });
  }

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;

    const names = Object.getOwnPropertyNames(value);
    let present = 0;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field.key);
      if (!descriptor) {
        if (field.optional) continue;
        return false;
      }
      if (!descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!field.validate(descriptor.value, seen)) return false;
      present += 1;
    }
    return names.length === present;
  };
}

function buildArrayValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const element = getArrayElement(schema);
  if (!element) return null;
  const validateElement = buildKnownJsonValueValidator(element, seenSchemas);
  if (validateElement === null) return null;

  return (value, seen) => {
    if (!Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || names[names.length - 1] !== "length") return false;

    for (let index = 0; index < value.length; index += 1) {
      const key = names[index];
      if (key !== String(index)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateElement(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildRecordValueValidator(
  def: ExtendedDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.keyType && !isPlainStringKeySchema(def.keyType)) return null;
  if (!def.valueType) return null;
  const validateValue = buildKnownJsonValueValidator(def.valueType, seenSchemas);
  if (validateValue === null) return null;

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;

    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateValue(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildLiteralValueValidator(def: ExtendedDef): KnownJsonValueValidator | null {
  if (!Array.isArray(def.values) || !def.values.every(isJsonPrimitive)) return null;
  return (value) => def.values!.some((item) => Object.is(item, value));
}

function buildEnumValueValidator(def: ExtendedDef): KnownJsonValueValidator | null {
  const values = Array.isArray(def.values)
    ? def.values
    : def.entries && typeof def.entries === "object"
      ? Object.values(def.entries)
      : null;
  if (values === null || !values.every(isJsonPrimitive)) return null;
  return (value) => values.some((item) => Object.is(item, value));
}

function isPlainStringKeySchema(schema: z.ZodType): boolean {
  const def = getDef(schema) as ExtendedDef;
  return def.type === "string"
    && !def.coerce
    && (!Array.isArray(def.checks) || def.checks.length === 0);
}

function isOptionalSchema(schema: z.ZodType): boolean {
  return (getDef(schema) as ExtendedDef).type === "optional";
}

function isJsonPrimitive(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function okLocalPatch<S extends z.ZodType>(
  state: z.output<S>,
  applied: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return {
    state,
    result: { ok: true },
    applied,
  };
}

function schemaViolation<S extends z.ZodType>(
  state: z.output<S>,
  path: Pointer,
  issues: z.ZodError["issues"],
): ApplyResult<S> {
  return {
    state,
    result: {
      ok: false,
      code: "schema_violation",
      reason: JSON.stringify(prefixIssues(path, issues)),
    },
    applied: [],
  };
}

function operationFailure<S extends z.ZodType>(
  state: z.output<S>,
  code: "not_serializable",
  reason: string,
): ApplyResult<S> {
  return {
    state,
    result: { ok: false, code, reason },
    applied: [],
  };
}

function cachedSchemaAtPointer(
  schema: z.ZodType,
  pointer: Pointer,
  mode: "value" | "insert" = "value",
): z.ZodType | null {
  let cache = localSchemaCaches.get(schema as object);
  if (!cache) {
    cache = { pointerSchemas: new Map() };
    localSchemaCaches.set(schema as object, cache);
  }
  const key = `${mode}\0${pointer}`;
  if (cache.pointerSchemas.has(key)) return cache.pointerSchemas.get(key) ?? null;
  const result = schemaAtPointer(schema, pointer, mode);
  cache.pointerSchemas.set(key, result);
  return result;
}

function isPlainStructuralSchema(schema: z.ZodType, seen = new WeakSet<object>()): boolean {
  const cached = plainStructuralSchemaCache.get(schema as object);
  if (cached !== undefined) return cached;
  if (seen.has(schema as object)) return true;
  seen.add(schema as object);

  const def = getDef(schema) as ExtendedDef;
  if (Array.isArray(def.checks) && def.checks.length > 0) return cachePlainStructuralSchema(schema, false);

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return cachePlainStructuralSchema(schema, false);
      if (!Object.values(shape).every((child) => isPlainStructuralSchema(child, seen))) {
        return cachePlainStructuralSchema(schema, false);
      }
      return cachePlainStructuralSchema(
        schema,
        def.catchall ? isPlainStructuralSchema(def.catchall, seen) : true,
      );
    }
    case "array": {
      const element = getArrayElement(schema);
      return cachePlainStructuralSchema(schema, element ? isPlainStructuralSchema(element, seen) : false);
    }
    case "record":
      return cachePlainStructuralSchema(
        schema,
        (!def.keyType || isPlainStructuralSchema(def.keyType, seen))
          && !!def.valueType
          && isPlainStructuralSchema(def.valueType, seen),
      );
    case "optional":
    case "nullable":
      return cachePlainStructuralSchema(schema, !!def.innerType && isPlainStructuralSchema(def.innerType, seen));
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "literal":
    case "enum":
    case "unknown":
    case "any":
    case "never":
      return cachePlainStructuralSchema(schema, true);
    default:
      return cachePlainStructuralSchema(schema, false);
  }
}

function cachePlainStructuralSchema(schema: z.ZodType, value: boolean): boolean {
  plainStructuralSchemaCache.set(schema as object, value);
  return value;
}

function prefixIssues(
  path: Pointer,
  issues: z.ZodError["issues"],
): z.ZodError["issues"] {
  const prefix = parsePointer(path).map((segment) => numericSegment(segment) ?? segment);
  return issues.map((issue) => ({
    ...issue,
    path: [...prefix, ...issue.path],
  }));
}

function numericSegment(segment: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  return Number(segment);
}

function appendArrayIndexPath(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

function indexDirection(previous: number, current: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
}
