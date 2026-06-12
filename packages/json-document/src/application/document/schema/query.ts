import type { z } from "zod";

import type { Pointer } from "../../../foundation/pointer/index.js";
import { describeSchema, type SchemaDescription, type SchemaKind } from "./description.js";
import { resolveDocumentSchema } from "./resolve.js";
import type { SchemaErrorResult, SchemaPathMode } from "./resolve.js";

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

export function queryDocumentSchema<S extends z.ZodType>(
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

export function readDocumentSchemaKind<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  mode: SchemaPathMode = "value",
): SchemaKindResult {
  const result = queryDocumentSchema(schema, path, mode);
  if (!result.ok) return result;
  return { ok: true, path, mode, kind: result.kind };
}

export function describeDocumentSchema<S extends z.ZodType>(
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
