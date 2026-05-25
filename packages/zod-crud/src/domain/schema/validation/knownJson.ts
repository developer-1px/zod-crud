import type * as z from "zod";
import { getArrayElement, getDef, getObjectShape, type ZodInternalDef } from "../zod.js";

export type KnownJsonValueValidator = (value: unknown, seen: WeakSet<object>) => boolean;

const knownJsonValueValidatorCache = new WeakMap<object, KnownJsonValueValidator | null>();
const primitiveJsonValueSeen = new WeakSet<object>();

export function acceptsKnownJsonValue(schema: z.ZodType, value: unknown): boolean {
  const validator = knownJsonValueValidatorForSchema(schema);
  return acceptsKnownJsonValueWithValidator(validator, value);
}

export function acceptsKnownJsonValueWithValidator(
  validator: KnownJsonValueValidator | null,
  value: unknown,
): boolean {
  return validator !== null
    && validator(value, value !== null && typeof value === "object"
      ? new WeakSet<object>()
      : primitiveJsonValueSeen);
}

export function knownJsonValueValidatorForSchema(schema: z.ZodType): KnownJsonValueValidator | null {
  const cached = knownJsonValueValidatorCache.get(schema as object);
  if (cached !== undefined) return cached;
  const validator = buildKnownJsonValueValidator(schema, new WeakSet<object>());
  knownJsonValueValidatorCache.set(schema as object, validator);
  return validator;
}

function buildKnownJsonValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (seenSchemas.has(schema as object)) return null;
  seenSchemas.add(schema as object);
  const validator = buildKnownJsonValueValidatorUnchecked(schema, seenSchemas);
  seenSchemas.delete(schema as object);
  return validator;
}

function buildKnownJsonValueValidatorUnchecked(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const def = getDef(schema);
  if (def.coerce || (Array.isArray(def.checks) && def.checks.length > 0)) return null;

  switch (def.type) {
    case "string":
      return (value) => typeof value === "string";
    case "number":
      return (value) => typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return (value) => typeof value === "boolean";
    case "null":
      return (value) => value === null;
    case "literal":
      return buildLiteralValueValidator(def);
    case "enum":
      return buildEnumValueValidator(def);
    case "optional": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value !== undefined && inner(value, seen);
    }
    case "nullable": {
      const inner = def.innerType ? buildKnownJsonValueValidator(def.innerType, seenSchemas) : null;
      return inner === null ? null : (value, seen) => value === null || inner(value, seen);
    }
    case "object":
      return buildObjectValueValidator(schema, def, seenSchemas);
    case "array":
      return buildArrayValueValidator(schema, seenSchemas);
    case "record":
      return buildRecordValueValidator(def, seenSchemas);
    default:
      return null;
  }
}

function buildObjectValueValidator(
  schema: z.ZodType,
  def: ZodInternalDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.catchall) return null;
  const shape = getObjectShape(schema);
  if (!shape) return null;

  const fields: Array<{ key: string; optional: boolean; validate: KnownJsonValueValidator }> = [];
  for (const key of Object.keys(shape)) {
    const childSchema = shape[key];
    if (!childSchema) return null;
    const validate = buildKnownJsonValueValidator(childSchema, seenSchemas);
    if (validate === null) return null;
    fields.push({ key, optional: isOptionalSchema(childSchema), validate });
  }

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    let present = 0;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field.key);
      if (!descriptor) {
        if (field.optional) continue;
        return false;
      }
      if (!descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!field.validate(descriptor.value, seen)) return false;
      present += 1;
    }
    return names.length === present;
  };
}

function buildArrayValueValidator(
  schema: z.ZodType,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  const element = getArrayElement(schema);
  if (!element) return null;
  const validateElement = buildKnownJsonValueValidator(element, seenSchemas);
  if (validateElement === null) return null;

  return (value, seen) => {
    if (!Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || names[names.length - 1] !== "length") return false;
    for (let index = 0; index < value.length; index += 1) {
      const key = names[index];
      if (key !== String(index)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateElement(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildRecordValueValidator(
  def: ZodInternalDef,
  seenSchemas: WeakSet<object>,
): KnownJsonValueValidator | null {
  if (def.keyType && !isPlainStringKeySchema(def.keyType)) return null;
  if (!def.valueType) return null;
  const validateValue = buildKnownJsonValueValidator(def.valueType, seenSchemas);
  if (validateValue === null) return null;

  return (value, seen) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) return false;
      if (!validateValue(descriptor.value, seen)) return false;
    }
    return true;
  };
}

function buildLiteralValueValidator(def: ZodInternalDef): KnownJsonValueValidator | null {
  if (!Array.isArray(def.values) || !def.values.every(isJsonPrimitive)) return null;
  return (value) => def.values!.some((item) => Object.is(item, value));
}

function buildEnumValueValidator(def: ZodInternalDef): KnownJsonValueValidator | null {
  const values = Array.isArray(def.values)
    ? def.values
    : def.entries && typeof def.entries === "object"
      ? Object.values(def.entries)
      : null;
  if (values === null || !values.every(isJsonPrimitive)) return null;
  return (value) => values.some((item) => Object.is(item, value));
}

export function isPlainStringKeySchema(schema: z.ZodType): boolean {
  const def = getDef(schema);
  return def.type === "string"
    && !def.coerce
    && (!Array.isArray(def.checks) || def.checks.length === 0);
}

function isOptionalSchema(schema: z.ZodType): boolean {
  return getDef(schema).type === "optional";
}

export function isJsonPrimitive(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}
