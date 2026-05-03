import * as z from "zod";

import type {
  JsonDoc,
  JsonPath,
  JsonValue,
  OperationResult,
} from "../types.js";
import { firstJsonDifference, sameJson } from "./json-diff.js";
import {
  deserialize,
  formatPath,
} from "../document/json-doc.js";
import { schemaAtPath } from "./schema-path.js";

export function validateAtPath(
  schema: z.ZodType<JsonValue>,
  path: JsonPath,
  value: JsonValue,
): OperationResult {
  const targetSchema = schemaAtPath(schema, path);

  if (targetSchema === null) {
    return {
      ok: false,
      reason: `No schema found for path ${formatPath(path)}.`,
    };
  }

  const result = targetSchema.safeParse(value);

  if (!result.success) {
    return {
      ok: false,
      reason: `Value does not match schema at ${formatPath(path)}.`,
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
      reason: "Document does not match the root schema.",
      error: result.error,
    };
  }

  if (!sameJson(result.data, value)) {
    const difference = firstJsonDifference(result.data, value);

    return {
      ok: false,
      reason: difference === null
        ? "Document does not match the root schema exactly."
        : `Document does not match the root schema exactly: ${difference}.`,
    };
  }

  return { ok: true };
}
