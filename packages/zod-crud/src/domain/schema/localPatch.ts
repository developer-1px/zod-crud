import type * as z from "zod";

import {
  applyTrustedPatch,
  type ApplyResult,
  type JSONPatchOperation,
} from "../../foundation/json-patch/index.js";
import {
  parentPointer,
  parsePointer,
  readAt,
  type Pointer,
} from "../../foundation/json-pointer/index.js";
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

export function applyPatchWithLocalSchemaValidation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): LocalPatchResult<S> {
  if (!isPlainStructuralSchema(schema)) return null;
  if (isIndependentReplacePatch(ops)) {
    return applyReplacePatchWithLocalSchemaValidation(schema, state, ops);
  }
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
    const valueSchema = schemaAtPointer(schema, op.path, "value");
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

function validateAppliedLocalOp<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  appliedOp: JSONPatchOperation,
  sourceValue: { ok: true; value: unknown } | { ok: false },
): LocalPatchResult<S> {
  switch (appliedOp.op) {
    case "replace": {
      if (appliedOp.path === "") return null;
      const valueSchema = schemaAtPointer(schema, appliedOp.path, "value");
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
    && (
      op.op === "replace"
      || op.op === "add"
      || op.op === "remove"
      || op.op === "copy"
      || op.op === "move"
    )
    && typeof op.path === "string";
}

function isIndependentReplacePatch(ops: ReadonlyArray<JSONPatchOperation>): boolean {
  if (!Array.isArray(ops) || ops.length === 0) return false;
  const paths: string[] = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return false;
    const op = ops[index]!;
    if (!op || typeof op !== "object" || op.op !== "replace" || typeof op.path !== "string" || op.path === "") {
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

function arrayElementSchemaAtPath(schema: z.ZodType, path: Pointer): z.ZodType | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  const parentSchema = schemaAtPointer(schema, parent, "value");
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

function isPlainStructuralSchema(schema: z.ZodType, seen = new WeakSet<object>()): boolean {
  if (seen.has(schema as object)) return true;
  seen.add(schema as object);

  const def = getDef(schema) as ExtendedDef;
  if (Array.isArray(def.checks) && def.checks.length > 0) return false;

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return false;
      if (!Object.values(shape).every((child) => isPlainStructuralSchema(child, seen))) return false;
      return def.catchall ? isPlainStructuralSchema(def.catchall, seen) : true;
    }
    case "array": {
      const element = getArrayElement(schema);
      return element ? isPlainStructuralSchema(element, seen) : false;
    }
    case "record":
      return (!def.keyType || isPlainStructuralSchema(def.keyType, seen))
        && !!def.valueType
        && isPlainStructuralSchema(def.valueType, seen);
    case "optional":
    case "nullable":
      return !!def.innerType && isPlainStructuralSchema(def.innerType, seen);
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "literal":
    case "enum":
    case "unknown":
    case "any":
    case "never":
      return true;
    default:
      return false;
  }
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
