import * as z from "zod";
import type { JsonPath } from "zod-crud";

export type EnumValueOption = string | number | boolean | null;

type AnySchema = z.ZodType<unknown>;

export function enumValueOptionsAtPath(schema: AnySchema, path: JsonPath): EnumValueOption[] {
  const target = schemaAtPath(schema, path);

  return target === null ? [] : enumValueOptions(target);
}

export function enumOptionDraft(value: EnumValueOption): string {
  return value === null ? "null" : String(value);
}

export function enumOptionLabel(value: EnumValueOption): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

export function enumOptionKey(value: EnumValueOption): string {
  return `${typeof value}:${enumOptionDraft(value)}`;
}

function schemaAtPath(schema: AnySchema, path: JsonPath): AnySchema | null {
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

function enumValueOptions(schema: AnySchema): EnumValueOption[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "literal") {
    return literalValues(current);
  }

  if (type === "enum") {
    return enumValues(current);
  }

  if (type === "union") {
    const values: EnumValueOption[] = [];

    for (const option of unionOptions(current)) {
      const optionValues = enumValueOptions(option);

      if (optionValues.length === 0) {
        return [];
      }

      values.push(...optionValues);
    }

    return uniqueOptions(values);
  }

  return [];
}

function literalValues(schema: AnySchema): EnumValueOption[] {
  const values = (schema as { values?: Set<unknown> }).values ?? schemaDef(schema).values;

  return Array.isArray(values)
    ? values.filter(isEnumValueOption)
    : values instanceof Set
      ? [...values].filter(isEnumValueOption)
      : [];
}

function enumValues(schema: AnySchema): EnumValueOption[] {
  const options = (schema as { options?: unknown[] }).options;

  if (Array.isArray(options)) {
    return options.filter(isEnumValueOption);
  }

  const entries = schemaDef(schema).entries;

  return entries !== null && typeof entries === "object"
    ? Object.values(entries).filter(isEnumValueOption)
    : [];
}

function uniqueOptions(values: EnumValueOption[]): EnumValueOption[] {
  const seen = new Set<string>();
  const unique: EnumValueOption[] = [];

  for (const value of values) {
    const key = enumOptionKey(value);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }

  return unique;
}

function unwrapTransparent(schema: AnySchema): AnySchema {
  let current = schema;

  for (let depth = 0; depth < 20; depth += 1) {
    const type = schemaType(current);

    if (
      type === "optional" ||
      type === "nullable" ||
      type === "default" ||
      type === "catch" ||
      type === "readonly" ||
      type === "lazy"
    ) {
      const unwrapped = unwrapOne(current);

      if (unwrapped === null || unwrapped === current) {
        return current;
      }

      current = unwrapped;
      continue;
    }

    return current;
  }

  return current;
}

function unwrapOne(schema: AnySchema): AnySchema | null {
  const maybeUnwrap = (schema as { unwrap?: () => AnySchema }).unwrap;

  if (typeof maybeUnwrap === "function") {
    return maybeUnwrap.call(schema);
  }

  const def = schemaDef(schema);
  const getter = def.getter;

  if (typeof getter === "function") {
    return getter() as AnySchema;
  }

  return (def.innerType as AnySchema | undefined) ?? null;
}

function objectShape(schema: AnySchema): Record<string, AnySchema> {
  const shape = (schema as { shape?: Record<string, AnySchema> }).shape;

  if (shape !== undefined) {
    return shape;
  }

  const defShape = schemaDef(schema).shape as Record<string, AnySchema> | (() => Record<string, AnySchema>) | undefined;

  return typeof defShape === "function" ? defShape() : defShape ?? {};
}

function arrayElement(schema: AnySchema): AnySchema | null {
  const element = (schema as { element?: AnySchema }).element;

  if (element !== undefined) {
    return element;
  }

  const def = schemaDef(schema);
  return (def.element as AnySchema | undefined) ?? (def.type as AnySchema | undefined) ?? null;
}

function unionOptions(schema: AnySchema): AnySchema[] {
  const options = (schema as { options?: AnySchema[] }).options;

  if (options !== undefined) {
    return options;
  }

  return (schemaDef(schema).options as AnySchema[] | undefined) ?? [];
}

function schemaType(schema: AnySchema): string {
  return (
    (schema as { type?: string }).type ??
    (schema as { def?: { type?: string } }).def?.type ??
    (schema as { _def?: { type?: string } })._def?.type ??
    ""
  );
}

function schemaDef(schema: AnySchema): Record<string, unknown> {
  const schemaWithDef = schema as unknown as {
    def?: Record<string, unknown>;
    _def?: Record<string, unknown>;
  };

  return schemaWithDef.def ?? schemaWithDef._def ?? {};
}

function isEnumValueOption(value: unknown): value is EnumValueOption {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}
