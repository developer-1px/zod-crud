import { toJSONSchema, type z } from "zod";

import type { CapabilityResult } from "./can/result.js";
import {
  getDiscriminatedUnionInfo,
  schemaAtPointer,
} from "../../domain/schema/introspection.js";
import {
  getArrayElement,
  getDef,
  getEnumValues,
  getLiteralValues,
  getObjectKeys,
  getObjectShape,
} from "../../domain/schema/zod.js";
import { appendSegment, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";

export type SchemaPathMode = "value" | "insert";

export type SchemaKind =
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

export interface SchemaDescription {
  kind: SchemaKind;
  jsonSchema: unknown;
  keys?: string[];
  elementKind?: SchemaKind;
  valueKind?: SchemaKind;
  discriminator?: string;
  allowed?: unknown[];
}

export type SchemaErrorCode = "invalid_pointer" | "path_not_found";

export interface SchemaErrorResult {
  ok: false;
  code: SchemaErrorCode;
  reason?: string;
  pointer: Pointer;
}

export type SchemaQueryResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
      description: SchemaDescription;
    }
  | SchemaErrorResult;

export type SchemaKindResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
    }
  | SchemaErrorResult;

export type SchemaDescriptionResult =
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
  accepts(path: Pointer, value: unknown, mode?: SchemaPathMode): CapabilityResult;
  describe(path: Pointer, mode?: SchemaPathMode): SchemaDescriptionResult;
}

interface DocumentSchemaResolutionOk {
  ok: true;
  schema: z.ZodType;
}

type DocumentSchemaResolutionResult = DocumentSchemaResolutionOk | SchemaErrorResult;

export function createSchemaState<S extends z.ZodType>(
  schema: S,
): SchemaState {
  return {
    at: (path, mode = "value") => queryDocumentSchema(schema, path, mode),
    kind: (path, mode = "value") => readDocumentSchemaKind(schema, path, mode),
    accepts: (path, value, mode = "value") => canDocumentSchemaAccepts(schema, path, value, mode),
    describe: (path, mode = "value") => describeDocumentSchema(schema, path, mode),
  };
}

function queryDocumentSchema<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaQueryResult {
  const resolved = resolveDocumentSchema(schema, path, mode);
  if (!resolved.ok) return resolved;
  const description = describeSchema(resolved.schema);
  return {
    ok: true,
    path,
    mode,
    kind: description.kind,
    description,
  };
}

function readDocumentSchemaKind<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaKindResult {
  const result = queryDocumentSchema(schema, path, mode);
  if (!result.ok) return result;
  return { ok: true, path, mode, kind: result.kind };
}

function canDocumentSchemaAccepts<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  value: unknown,
  mode: SchemaPathMode = "value",
): CapabilityResult {
  const resolved = resolveDocumentSchema(schema, path, mode);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      pointer: resolved.pointer,
      ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
    };
  }

  const parsed = resolved.schema.safeParse(value);
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    code: "schema_violation",
    reason: JSON.stringify(parsed.error.issues),
    violations: parsed.error.issues.map((issue) => ({
      path: issue.path.reduce<Pointer>((base, segment) => appendSegment(base, String(segment)), path),
      message: issue.message,
    })),
  };
}

function describeDocumentSchema<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaDescriptionResult {
  const result = queryDocumentSchema(schema, path, mode);
  if (!result.ok) return result;
  return {
    ok: true,
    path,
    mode,
    description: result.description,
  };
}

function resolveDocumentSchema(
  schema: z.ZodType,
  path: Pointer,
  mode: SchemaPathMode,
): DocumentSchemaResolutionResult {
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

  // `allowed` reflects every closed value set MECE-ly: discriminatedUnion (above),
  // enum, and literal. Readers (clear-contents, toggle-value, ...) can enumerate options
  // from the schema instead of requiring host-supplied values.
  const enumValues = getEnumValues(schema);
  if (enumValues) description.allowed = enumValues;
  const literalValues = getLiteralValues(schema);
  if (literalValues) description.allowed = literalValues;

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
