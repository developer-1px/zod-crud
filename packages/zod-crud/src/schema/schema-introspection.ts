import * as z from "zod";

export type AnySchema = z.ZodType<unknown>;

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

export function objectShape(schema: AnySchema): Record<string, AnySchema> {
  const shape = (schema as { shape?: Record<string, AnySchema> }).shape;

  if (shape !== undefined) {
    return shape;
  }

  const def = schemaDef(schema);
  const defShape = def.shape as Record<string, AnySchema> | (() => Record<string, AnySchema>) | undefined;

  if (typeof defShape === "function") {
    return defShape();
  }

  return defShape ?? {};
}

export function unionOptions(schema: AnySchema): AnySchema[] {
  const options = (schema as { options?: AnySchema[] }).options;

  if (options !== undefined) {
    return options;
  }

  const def = schemaDef(schema);
  return (def.options as AnySchema[] | undefined) ?? [];
}

export function unwrapOne(schema: AnySchema): AnySchema | null {
  const maybeUnwrap = (schema as { unwrap?: () => AnySchema }).unwrap;

  if (typeof maybeUnwrap === "function") {
    return maybeUnwrap.call(schema);
  }

  const def = schemaDef(schema);
  return (def.innerType as AnySchema | undefined) ?? null;
}

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

export function schemaAllowsArray(schema: AnySchema): boolean {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "array") {
    return true;
  }

  if (type === "union") {
    return unionOptions(current).some(schemaAllowsArray);
  }

  if (type === "intersection") {
    const def = schemaDef(current);
    const left = def.left as AnySchema | undefined;
    const right = def.right as AnySchema | undefined;

    return left !== undefined && right !== undefined && schemaAllowsArray(left) && schemaAllowsArray(right);
  }

  if (type === "pipe") {
    const def = schemaDef(current);
    const output = def.out as AnySchema | undefined;
    const input = def.in as AnySchema | undefined;

    return (output !== undefined && schemaAllowsArray(output)) || (input !== undefined && schemaAllowsArray(input));
  }

  return false;
}

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
