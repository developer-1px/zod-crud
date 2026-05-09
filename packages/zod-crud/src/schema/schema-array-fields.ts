import * as z from "zod";

import type { JsonDoc, JsonNode } from "../types.js";
import { getNode, getPath } from "../document/json-doc-access.js";
import {
  type AnySchema,
  objectShape,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";
import { schemaAllowsArray } from "./schema-allows-array.js";
import { schemaAtPath } from "./schema-path.js";

export function objectArrayFieldKeys(schema: AnySchema): string[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);
  const keys = new Set<string>();

  if (type === "object") {
    for (const [key, childSchema] of Object.entries(objectShape(current))) {
      if (schemaAllowsArray(childSchema)) {
        keys.add(key);
      }
    }

    return [...keys];
  }

  if (type === "union") {
    for (const option of unionOptions(current)) {
      for (const key of objectArrayFieldKeys(option)) {
        keys.add(key);
      }
    }

    return [...keys];
  }

  if (type === "intersection") {
    const def = schemaDef(current);
    const left = def.left as AnySchema | undefined;
    const right = def.right as AnySchema | undefined;

    for (const side of [left, right]) {
      if (side === undefined) {
        continue;
      }

      for (const key of objectArrayFieldKeys(side)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

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
