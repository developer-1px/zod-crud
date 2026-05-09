import type { AnySchema } from "./schema-introspection.js";
import {
  schemaDef,
  schemaType,
  unwrapTransparent,
} from "./schema-introspection.js";
import { recordKeyMatches } from "./schema-record-key.js";

export function arrayElement(schema: AnySchema): AnySchema | null {
  const current = unwrapTransparent(schema);
  const element = (current as { element?: AnySchema }).element;

  if (element !== undefined) {
    return element;
  }

  const def = schemaDef(current);
  return (def.element as AnySchema | undefined) ?? (def.type as AnySchema | undefined) ?? null;
}

export function tupleElement(schema: AnySchema, index: number): AnySchema | null {
  const def = schemaDef(schema);
  const items = def.items as AnySchema[] | undefined;

  if (items?.[index] !== undefined) {
    return items[index]!;
  }

  return (def.rest as AnySchema | undefined) ?? null;
}

export function objectCatchall(schema: AnySchema): AnySchema | null {
  const catchall = schemaDef(schema).catchall as AnySchema | undefined;

  if (catchall === undefined || schemaType(catchall) === "never") {
    return null;
  }

  return catchall;
}

export function recordValue(schema: AnySchema, key: string | number): AnySchema | null {
  if (typeof key !== "string") {
    return null;
  }

  const def = schemaDef(schema);
  const keySchema = def.keyType as AnySchema | undefined;

  if (keySchema !== undefined && !recordKeyMatches(keySchema, key)) {
    return null;
  }

  return (def.valueType as AnySchema | undefined) ?? null;
}
