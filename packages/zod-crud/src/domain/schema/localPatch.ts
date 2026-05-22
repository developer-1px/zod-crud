import type * as z from "zod";

import {
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
} from "../../foundation/json-patch/index.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import {
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

interface ExtendedDef {
  type?: string;
  checks?: unknown[];
  innerType?: z.ZodType;
  catchall?: z.ZodType;
  keyType?: z.ZodType;
  valueType?: z.ZodType;
}

interface LocalSchemaCache {
  pointerSchemas: Map<string, z.ZodType | null>;
}

const plainStructuralSchemaCache = new WeakMap<object, boolean>();
const localSchemaCaches = new WeakMap<object, LocalSchemaCache>();

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (!isPlainStructuralSchema(schema)) return null;
  const sameArrayFieldReplace = applySameArrayFieldReplacePatchWithLocalSchemaValidation(schema, state, ops);
  if (sameArrayFieldReplace) return sameArrayFieldReplace;
  if (isIndependentReplacePatch(ops)) {
    return applyReplacePatchWithLocalSchemaValidation(schema, state, ops);
  }
  const arrayBatch = applySameArrayPatchWithLocalSchemaValidation(schema, state, ops);
  if (arrayBatch) return arrayBatch;
  return applySequentialPatchWithLocalSchemaValidation(schema, state, ops);
}

function applyReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  const applied = applyTrustedPatch(state, ops);
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

function applySameArrayFieldReplacePatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  const parsed = sameArrayFieldReplaceOps(ops);
  if (parsed === null) return null;

  const applied = applyTrustedPatch(state, ops);
  if (!applied.result.ok) {
    return {
      state,
      result: applied.result,
      applied: [],
    };
  }

  const valueSchema = cachedSchemaAtPointer(schema, parsed[0]!.path, "value");
  if (!valueSchema) return null;
  for (const op of parsed) {
    const result = valueSchema.safeParse(op.value);
    if (!result.success) return schemaViolation(state, op.path, result.error.issues);
  }

  return {
    state: applied.state as z.output<S>,
    result: { ok: true },
    applied: applied.applied,
  };
}

function applySequentialPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (!Array.isArray(ops) || ops.length === 0) return null;

  let cur: unknown = state;
  const appliedOps: JSONPatchOperation[] = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (!isSupportedLocalOpCandidate(op)) return null;

    const sourceValue = sourceValueForValidation(cur, op);
    const applied = applyTrustedPatch(cur, [op]);
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

function applySameArrayPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
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
    const jsonError = jsonSerializableError(op.value);
    if (jsonError !== null) return operationFailure(state, "not_serializable", jsonError);
    const parsed = elementSchema.safeParse(op.value);
    if (!parsed.success) return schemaViolation(state, op.path, parsed.error.issues);
  }

  const applied = applyTrustedPatch(state, ops);
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

function sameArrayFieldReplaceOps(
  ops: ReadonlyArray<JSONPatchOperation>,
): Array<{ path: Pointer; index: number; key: string; value: unknown }> | null {
  if (!Array.isArray(ops) || ops.length < 2) return null;

  let arraySegments: string[] | null = null;
  let field: string | null = null;
  const seenIndexes = new Set<number>();
  const parsed: Array<{ path: Pointer; index: number; key: string; value: unknown }> = [];

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

    let segments: string[];
    try {
      segments = parsePointer(op.path);
    } catch {
      return null;
    }
    if (segments.length < 2) return null;
    const key = segments[segments.length - 1]!;
    const index = numericSegment(segments[segments.length - 2]!);
    if (index === null) return null;

    if (field === null) field = key;
    else if (field !== key) return null;

    const nextArraySegments = segments.slice(0, -2);
    if (arraySegments === null) arraySegments = nextArraySegments;
    else if (!sameSegments(arraySegments, nextArraySegments)) return null;

    if (seenIndexes.has(index)) return null;
    seenIndexes.add(index);
    parsed.push({ path: op.path, index, key, value: op.value });
  }

  return parsed;
}

function sameSegments(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
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
