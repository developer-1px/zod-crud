import type * as z from "zod";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import { tryParsePointer } from "../../foundation/json-pointer/index.js";

type ZodDef = {
  type?: string;
  shape?: unknown;
  element?: z.ZodType;
  valueType?: z.ZodType;
  options?: z.ZodType[];
  discriminator?: string;
  values?: unknown[];
};

export interface DiscriminatedUnionInfo {
  discriminator: string;
  allowed: unknown[];
}

interface SchemaPointerCache {
  schemas: Map<string, z.ZodType | null>;
}

const schemaPointerCaches = new WeakMap<object, SchemaPointerCache>();

export function getDef(schema: z.ZodType): ZodDef {
  return ((schema as { def?: ZodDef; _def?: ZodDef }).def ?? (schema as { _def?: ZodDef })._def ?? {}) as ZodDef;
}

export function getObjectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const shape = getDef(schema).shape ?? (schema as { shape?: unknown }).shape;
  const resolved = typeof shape === "function" ? shape() : shape;
  if (!resolved || typeof resolved !== "object") return null;
  return resolved as Record<string, z.ZodType>;
}

export function getObjectKeys(schema: z.ZodType): string[] | null {
  const shape = getObjectShape(schema);
  return shape ? Object.keys(shape) : null;
}

export function getArrayElement(schema: z.ZodType): z.ZodType | null {
  const def = getDef(schema);
  return def.type === "array" && def.element ? def.element : null;
}

export function getDiscriminatedUnionInfo(schema: z.ZodType): DiscriminatedUnionInfo | null {
  const def = getDef(schema);
  if (def.discriminator && Array.isArray(def.options)) {
    return {
      discriminator: def.discriminator,
      allowed: def.options.flatMap((option) => getDiscriminatorValues(option, def.discriminator as string)),
    };
  }
  return null;
}

export function getObjectLiteralValues(schema: z.ZodType, key: string): unknown[] {
  const shape = getObjectShape(schema);
  const valueSchema = shape?.[key];
  if (!valueSchema) return [];
  const def = getDef(valueSchema);
  return Array.isArray(def.values) ? def.values : [];
}

export function schemaAtPointer(schema: z.ZodType, pointer: Pointer, mode: "value" | "insert" = "value"): z.ZodType | null {
  let cache = schemaPointerCaches.get(schema as object);
  if (!cache) {
    cache = { schemas: new Map() };
    schemaPointerCaches.set(schema as object, cache);
  }
  const cacheKey = `${mode}\0${pointer}`;
  if (cache.schemas.has(cacheKey)) return cache.schemas.get(cacheKey)!;

  const result = schemaAtPointerUncached(schema, pointer, mode);
  cache.schemas.set(cacheKey, result);
  return result;
}

function schemaAtPointerUncached(schema: z.ZodType, pointer: Pointer, mode: "value" | "insert"): z.ZodType | null {
  let current: z.ZodType | null = schema;
  const segments = tryParsePointer(pointer);
  if (segments === null) return null;

  for (let i = 0; i < segments.length && current; i += 1) {
    const segment = segments[i];
    if (segment === undefined) return null;
    const arrayElement = getArrayElement(current);
    if (arrayElement && isArrayElementSegment(segment)) {
      current = arrayElement;
      continue;
    }

    const shape = getObjectShape(current);
    if (shape && segment in shape) {
      current = shape[segment] ?? null;
      continue;
    }

    const def = getDef(current);
    if (def.type === "record" && def.valueType) {
      current = def.valueType;
      continue;
    }

    return null;
  }

  if (mode === "insert") {
    return current ? (getArrayElement(current) ?? current) : null;
  }
  return current;
}

function isArrayElementSegment(segment: string): boolean {
  if (segment === "-") return true;
  if (segment.length === 0) return false;
  for (let index = 0; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

function getDiscriminatorValues(schema: z.ZodType, discriminator: string): unknown[] {
  const shape = getObjectShape(schema);
  const discriminatorSchema = shape?.[discriminator];
  if (!discriminatorSchema) return [];

  const def = getDef(discriminatorSchema);
  if (Array.isArray(def.values)) return def.values;
  if ("value" in def) return [(def as { value: unknown }).value];
  return [];
}
