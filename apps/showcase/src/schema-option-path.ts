import * as z from "zod";
import type { JsonPath } from "zod-crud";

import {
  type AnySchema,
  arrayElement,
  objectShape,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./showcase-schema-introspection.js";

export function schemaAtPath(schema: AnySchema, path: JsonPath): AnySchema | null {
  let current: AnySchema | null = schema;

  for (const key of path) {
    if (current === null) {
      return null;
    }

    current = schemaChild(current, key);
  }

  return current;
}

function schemaChild(schema: AnySchema, key: string | number): AnySchema | null {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "object") {
    if (typeof key !== "string") {
      return null;
    }

    return objectShape(current)[key] ?? null;
  }

  if (type === "array") {
    return typeof key === "number" && Number.isInteger(key) ? arrayElement(current) : null;
  }

  if (type === "union") {
    const children = unionOptions(current)
      .map((option) => schemaChild(option, key))
      .filter((option): option is AnySchema => option !== null);

    if (children.length === 0) {
      return null;
    }

    return children.length === 1 ? children[0]! : z.union(children as [AnySchema, AnySchema, ...AnySchema[]]);
  }

  return null;
}
