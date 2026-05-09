import * as z from "zod";

import type {
  JsonDoc,
  JsonPath,
  JsonValue,
  OperationResult,
} from "./types.js";
import { firstJsonDifference, sameJson } from "./document/json-doc-values.js";
import { formatPath } from "./document/json-doc-format.js";
import { deserialize } from "./document/json-doc-serialization.js";
import { schemaAtPath } from "./schema/schema-path.js";

export function validateAtPath(
  schema: z.ZodType<JsonValue>,
  path: JsonPath,
  value: JsonValue,
): OperationResult {
  const targetSchema = schemaAtPath(schema, path);

  if (targetSchema === null) {
    return {
      ok: false,
      code: "schema_mismatch",
      reason: `No schema found for path ${formatPath(path)}.`,
      path,
    };
  }

  const result = targetSchema.safeParse(value);

  if (!result.success) {
    return {
      ok: false,
      code: "schema_mismatch",
      reason: `Value does not match schema at ${formatPath(path)}.`,
      path,
      error: result.error,
    };
  }

  return { ok: true };
}

export function validateDocument(schema: z.ZodType<JsonValue>, doc: JsonDoc): OperationResult {
  const value = deserialize(doc);
  const result = schema.safeParse(value);

  if (!result.success) {
    return {
      ok: false,
      code: "schema_mismatch",
      reason: "Document does not match the root schema.",
      error: result.error,
    };
  }

  if (!sameJson(result.data, value)) {
    const difference = firstJsonDifference(result.data, value);

    return {
      ok: false,
      code: "schema_mismatch",
      reason: difference === null
        ? "Document does not match the root schema exactly."
        : `Document does not match the root schema exactly: ${difference}.`,
    };
  }

  return { ok: true };
}
