import type { JsonPath } from "../types.js";
import type { AnySchema } from "./schema-introspection.js";
import { schemaChild } from "./schema-child.js";

export {
  objectArrayFieldKeys,
} from "./schema-array-fields.js";

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
