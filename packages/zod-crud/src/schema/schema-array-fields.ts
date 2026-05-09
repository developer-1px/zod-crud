import {
  type AnySchema,
  objectShape,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";
import { schemaAllowsArray } from "./schema-allows-array.js";

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
