import * as z from "zod";

export type AnySchema = z.ZodType<unknown>;

export function unwrapTransparent(schema: AnySchema): AnySchema {
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

export function unwrapOne(schema: AnySchema): AnySchema | null {
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

export function objectShape(schema: AnySchema): Record<string, AnySchema> {
  const shape = (schema as { shape?: Record<string, AnySchema> }).shape;

  if (shape !== undefined) {
    return shape;
  }

  const defShape = schemaDef(schema).shape as Record<string, AnySchema> | (() => Record<string, AnySchema>) | undefined;

  return typeof defShape === "function" ? defShape() : defShape ?? {};
}

export function arrayElement(schema: AnySchema): AnySchema | null {
  const element = (schema as { element?: AnySchema }).element;

  if (element !== undefined) {
    return element;
  }

  const def = schemaDef(schema);
  return (def.element as AnySchema | undefined) ?? (def.type as AnySchema | undefined) ?? null;
}

export function unionOptions(schema: AnySchema): AnySchema[] {
  const options = (schema as { options?: AnySchema[] }).options;

  if (options !== undefined) {
    return options;
  }

  return (schemaDef(schema).options as AnySchema[] | undefined) ?? [];
}

export function schemaType(schema: AnySchema): string {
  return (
    (schema as { type?: string }).type ??
    (schema as { def?: { type?: string } }).def?.type ??
    (schema as { _def?: { type?: string } })._def?.type ??
    ""
  );
}

export function schemaDef(schema: AnySchema): Record<string, unknown> {
  const schemaWithDef = schema as unknown as {
    def?: Record<string, unknown>;
    _def?: Record<string, unknown>;
  };

  return schemaWithDef.def ?? schemaWithDef._def ?? {};
}
