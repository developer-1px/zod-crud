import type { AnySchema } from "./schema-introspection.js";
import {
  schemaType,
  unwrapTransparent,
} from "./schema-introspection.js";

export function recordKeyMatches(keySchema: AnySchema, key: string): boolean {
  if (keySchema.safeParse(key).success) {
    return true;
  }

  if (schemaType(unwrapTransparent(keySchema)) !== "number") {
    return false;
  }

  const numericKey = Number(key);

  return Number.isFinite(numericKey) && keySchema.safeParse(numericKey).success;
}
