import type * as z from "zod";

export interface ZodInternalDef {
  type?: string;
  coerce?: boolean;
  checks?: unknown[];
  shape?: unknown;
  element?: z.ZodType;
  innerType?: z.ZodType;
  catchall?: z.ZodType;
  keyType?: z.ZodType;
  valueType?: z.ZodType;
  options?: z.ZodType[];
  items?: z.ZodType[];
  rest?: z.ZodType | null;
  getter?: () => z.ZodType;
  in?: z.ZodType;
  out?: z.ZodType;
  left?: z.ZodType;
  right?: z.ZodType;
  discriminator?: string;
  values?: unknown[];
  entries?: Record<string, unknown>;
}

export function getDef(schema: z.ZodType): ZodInternalDef {
  return ((schema as { def?: ZodInternalDef; _def?: ZodInternalDef }).def
    ?? (schema as { _def?: ZodInternalDef })._def
    ?? {}) as ZodInternalDef;
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
