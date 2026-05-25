import { toJSONSchema, type z } from "zod";

import type { CapabilityResult } from "./capability.js";
import {
  getDiscriminatedUnionInfo,
  schemaAtPointer,
} from "../../domain/schema/introspection.js";
import {
  getArrayElement,
  getDef,
  getObjectKeys,
  getObjectShape,
} from "../../domain/schema/zodIntrospectionAdapter.js";
import { appendSegment, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";

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

export type DocumentSchemaParseResult =
  | { success: true }
  | {
      success: false;
      error: {
        issues: ReadonlyArray<{
          path: PropertyKey[];
          message: string;
        }>;
      };
    };

export interface PlanDocumentSchemaAcceptsResultInput {
  path: Pointer;
  result: DocumentSchemaParseResult;
}

export interface PlanDocumentSchemaResolutionInput {
  schema: z.ZodType;
  path: Pointer;
  mode: SchemaPathMode;
}

interface CreateSchemaOptions<S extends z.ZodType> {
  schema: S;
}

export interface DocumentSchemaContext<S extends z.ZodType> {
  schema: S;
}

export interface DocumentSchemaResolutionOk {
  ok: true;
  schema: z.ZodType;
}

export type DocumentSchemaResolutionResult = DocumentSchemaResolutionOk | SchemaErrorResult;

export function createSchemaState<S extends z.ZodType>(
  args: CreateSchemaOptions<S>,
): SchemaState {
  const context: DocumentSchemaContext<S> = { schema: args.schema };

  const at = (path: Pointer, mode: SchemaPathMode = "value"): SchemaQueryResult => {
    return queryDocumentSchema(context, path, mode);
  };

  return {
    at,
    kind(path, mode = "value") {
      return readDocumentSchemaKind(context, path, mode);
    },
    accepts(path, value, mode = "value") {
      return canDocumentSchemaAccepts(context, path, value, mode);
    },
    describe(path, mode = "value") {
      return describeDocumentSchema(context, path, mode);
    },
  };
}

export function queryDocumentSchema<S extends z.ZodType>(
  context: DocumentSchemaContext<S>,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaQueryResult {
  const resolved = planDocumentSchemaResolution({
    schema: context.schema,
    path,
    mode,
  });
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

export function readDocumentSchemaKind<S extends z.ZodType>(
  context: DocumentSchemaContext<S>,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaKindResult {
  const result = queryDocumentSchema(context, path, mode);
  if (!result.ok) return result;
  return { ok: true, path, mode, kind: result.kind };
}

export function canDocumentSchemaAccepts<S extends z.ZodType>(
  context: DocumentSchemaContext<S>,
  path: Pointer,
  value: unknown,
  mode: SchemaPathMode = "value",
): CapabilityResult {
  const resolved = planDocumentSchemaResolution({
    schema: context.schema,
    path,
    mode,
  });
  if (!resolved.ok) {
    const error: Extract<CapabilityResult, { ok: false }> = {
      ok: false,
      code: resolved.code,
      pointer: resolved.pointer,
    };
    if (resolved.reason !== undefined) error.reason = resolved.reason;
    return error;
  }

  const parsed = resolved.schema.safeParse(value);
  return planDocumentSchemaAcceptsResult({ path, result: parsed });
}

export function describeDocumentSchema<S extends z.ZodType>(
  context: DocumentSchemaContext<S>,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaDescriptionResult {
  const result = queryDocumentSchema(context, path, mode);
  if (!result.ok) return result;
  return {
    ok: true,
    path,
    mode,
    description: result.description,
  };
}

export function planDocumentSchemaAcceptsResult(
  input: PlanDocumentSchemaAcceptsResultInput,
): CapabilityResult {
  if (input.result.success) return { ok: true };
  return {
    ok: false,
    code: "schema_violation",
    reason: JSON.stringify(input.result.error.issues),
    violations: input.result.error.issues.map((issue) => ({
      path: absoluteIssuePath(input.path, issue.path),
      message: issue.message,
    })),
  };
}

export function planDocumentSchemaResolution(
  input: PlanDocumentSchemaResolutionInput,
): DocumentSchemaResolutionResult {
  const { schema, path, mode } = input;
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
