import type { z } from "zod";

import { schemaAtPointer } from "../../../domain/schema/introspection.js";
import { tryParsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import type {
  SchemaErrorResult,
  SchemaPathMode,
} from "./types.js";

interface DocumentSchemaResolutionOk {
  ok: true;
  schema: z.ZodType;
}

export type DocumentSchemaResolutionResult = DocumentSchemaResolutionOk | SchemaErrorResult;

export function resolveDocumentSchema(
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
