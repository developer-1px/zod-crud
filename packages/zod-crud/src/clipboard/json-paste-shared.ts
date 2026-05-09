import * as z from "zod";

import type { JsonDoc, JsonNode, JsonValue } from "../types.js";
import { getNode, getPath } from "../document/json-doc.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";

export function objectArrayFieldKeysOfTarget(
  doc: JsonDoc,
  schema: z.ZodType<unknown>,
  target: JsonNode,
  childKeys: string[],
): string[] {
  const keys = new Set<string>();
  const targetSchema = schemaAtPath(schema, getPath(doc, target.id));

  if (targetSchema !== null) {
    for (const childKey of objectArrayFieldKeys(targetSchema)) {
      keys.add(childKey);
    }
  }

  for (const childId of target.children) {
    const child = getNode(doc, childId);

    if (child.type === "array" && typeof child.key === "string") {
      keys.add(child.key);
    }
  }

  for (const childKey of childKeys) {
    keys.add(childKey);
  }

  return [...keys];
}

export function jsonNodeTypeOf(value: JsonValue): JsonNode["type"] {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "object") {
    return "object";
  }

  if (typeof value === "string") {
    return "string";
  }

  if (typeof value === "number") {
    return "number";
  }

  return "boolean";
}
