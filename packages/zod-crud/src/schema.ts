import { toJSONSchema, type z } from "zod";

import type { CheckResult } from "./check.js";
import {
  getArrayElement,
  getDef,
  getDiscriminatedUnionInfo,
  getObjectKeys,
  getObjectShape,
  schemaAtPointer,
} from "./core/schema/introspection.js";
import { appendSegment, tryParsePointer, type Pointer } from "./core/pointer/index.js";

type SchemaPathMode = "value" | "insert";

type SchemaKind =
  | "unknown"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "literal"
  | "enum"
  | "object"
  | "array"
  | "record"
  | "union"
  | "discriminatedUnion"
  | "optional"
  | "nullable"
  | "any";

interface SchemaDescription {
  kind: SchemaKind;
  jsonSchema: unknown;
  keys?: string[];
  elementKind?: SchemaKind;
  valueKind?: SchemaKind;
  discriminator?: string;
  allowed?: unknown[];
}

type SchemaErrorCode = "invalid_pointer" | "path_not_found";

interface SchemaErrorResult {
  ok: false;
  code: SchemaErrorCode;
  reason?: string;
  pointer: Pointer;
}

type SchemaQueryResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
      description: SchemaDescription;
    }
  | SchemaErrorResult;

type SchemaKindResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
    }
  | SchemaErrorResult;

type SchemaDescriptionResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      description: SchemaDescription;
    }
  | SchemaErrorResult;

export interface SchemaState {
  at(path: Pointer, mode?: SchemaPathMode): SchemaQueryResult;
  kind(path: Pointer, mode?: SchemaPathMode): SchemaKindResult;
  accepts(path: Pointer, value: unknown, mode?: SchemaPathMode): CheckResult;
  describe(path: Pointer, mode?: SchemaPathMode): SchemaDescriptionResult;
}

interface CreateSchemaOptions<S extends z.ZodType> {
  schema: S;
}

interface ResolveSchemaOk {
  ok: true;
  schema: z.ZodType;
}

type ResolveSchemaResult = ResolveSchemaOk | SchemaErrorResult;

export function createSchemaState<S extends z.ZodType>(
  args: CreateSchemaOptions<S>,
): SchemaState {
  const rootSchema = args.schema;

  const at = (path: Pointer, mode: SchemaPathMode = "value"): SchemaQueryResult => {
    const resolved = resolveSchema(rootSchema, path, mode);
    if (!resolved.ok) return resolved;
    const description = describeSchema(resolved.schema);
    return {
      ok: true,
      path,
      mode,
      kind: description.kind,
      description,
    };
  };

  return {
    at,
    kind(path, mode = "value") {
      const result = at(path, mode);
      if (!result.ok) return result;
      return { ok: true, path, mode, kind: result.kind };
    },
    accepts(path, value, mode = "value") {
      const resolved = resolveSchema(rootSchema, path, mode);
      if (!resolved.ok) {
        const error: Extract<CheckResult, { ok: false }> = {
          ok: false,
          code: resolved.code,
          pointer: resolved.pointer,
        };
        if (resolved.reason !== undefined) error.reason = resolved.reason;
        return error;
      }

      const parsed = resolved.schema.safeParse(value);
      if (parsed.success) return { ok: true };
      return {
        ok: false,
        code: "schema_violation",
        reason: JSON.stringify(parsed.error.issues),
        violations: parsed.error.issues.map((issue) => ({
          path: absoluteIssuePath(path, issue.path),
          message: issue.message,
        })),
      };
    },
    describe(path, mode = "value") {
      const result = at(path, mode);
      if (!result.ok) return result;
      return {
        ok: true,
        path,
        mode,
        description: result.description,
      };
    },
  };
}

function resolveSchema(
  schema: z.ZodType,
  path: Pointer,
  mode: SchemaPathMode,
): ResolveSchemaResult {
  const segments = tryParsePointer(path);
  if (segments === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid schema pointer: ${path}`,
      pointer: path,
    };
  }

  const resolved = schemaAtPointer(schema, path, mode);
  if (!resolved) {
    return {
      ok: false,
      code: "path_not_found",
      reason: `schema path not found: ${path}`,
      pointer: path,
    };
  }
  return { ok: true, schema: resolved };
}

function describeSchema(schema: z.ZodType): SchemaDescription {
  const kind = schemaKind(schema);
  const description: SchemaDescription = {
    kind,
    jsonSchema: safeJSONSchema(schema),
  };

  const keys = getObjectKeys(schema);
  if (keys) description.keys = keys;

  const element = getArrayElement(schema);
  if (element) description.elementKind = schemaKind(element);

  const def = getDef(schema);
  if (def.type === "record" && def.valueType) {
    description.valueKind = schemaKind(def.valueType);
  }

  const du = getDiscriminatedUnionInfo(schema);
  if (du) {
    description.discriminator = du.discriminator;
    description.allowed = [...du.allowed];
  }

  return description;
}

function schemaKind(schema: z.ZodType): SchemaKind {
  if (getDiscriminatedUnionInfo(schema)) return "discriminatedUnion";
  if (getArrayElement(schema)) return "array";
  if (getObjectShape(schema)) return "object";

  const def = getDef(schema);
  if (def.type === "record") return "record";
  if (def.type === "string") return "string";
  if (def.type === "number") return "number";
  if (def.type === "boolean") return "boolean";
  if (def.type === "null") return "null";
  if (def.type === "literal") return "literal";
  if (def.type === "enum") return "enum";
  if (def.type === "union") return "union";
  if (def.type === "optional") return "optional";
  if (def.type === "nullable") return "nullable";
  if (def.type === "any" || def.type === "unknown") return "any";
  return "unknown";
}

function safeJSONSchema(schema: z.ZodType): unknown {
  try {
    return JSON.parse(JSON.stringify(toJSONSchema(schema)));
  } catch {
    return null;
  }
}

function absoluteIssuePath(base: Pointer, issuePath: PropertyKey[]): Pointer {
  return issuePath.reduce<Pointer>((path, segment) => appendSegment(path, String(segment)), base);
}
