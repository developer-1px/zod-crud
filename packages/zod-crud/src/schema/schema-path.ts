import * as z from "zod";

import type { JsonPath } from "../types.js";

type AnySchema = z.ZodType<unknown>;

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

function schemaChild(schema: AnySchema, key: string | number): AnySchema | null {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "object") {
    if (typeof key !== "string") {
      return null;
    }

    return objectShape(current)[key] ?? objectCatchall(current);
  }

  if (type === "array") {
    if (typeof key !== "number" || !Number.isInteger(key)) {
      return null;
    }

    return arrayElement(current);
  }

  if (type === "tuple") {
    if (typeof key !== "number" || !Number.isInteger(key)) {
      return null;
    }

    return tupleElement(current, key);
  }

  if (type === "record") {
    return recordValue(current, key);
  }

  if (type === "intersection") {
    return intersectionChild(current, key);
  }

  if (type === "pipe") {
    return pipeChild(current, key);
  }

  if (type === "union") {
    const options = unionOptions(current);
    const children = options
      .map((option) => schemaChild(option, key))
      .filter((option): option is AnySchema => option !== null);

    if (children.length === 0) {
      return null;
    }

    if (children.length === 1) {
      return children[0]!;
    }

    return z.union(children as [AnySchema, AnySchema, ...AnySchema[]]);
  }

  return null;
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
  return (def.innerType as AnySchema | undefined) ?? null;
}

function schemaAllowsArray(schema: AnySchema): boolean {
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

function arrayElement(schema: AnySchema): AnySchema | null {
  const current = unwrapTransparent(schema);
  const element = (current as { element?: AnySchema }).element;

  if (element !== undefined) {
    return element;
  }

  const def = schemaDef(current);
  return (def.element as AnySchema | undefined) ?? (def.type as AnySchema | undefined) ?? null;
}

function tupleElement(schema: AnySchema, index: number): AnySchema | null {
  const def = schemaDef(schema);
  const items = def.items as AnySchema[] | undefined;

  if (items?.[index] !== undefined) {
    return items[index]!;
  }

  return (def.rest as AnySchema | undefined) ?? null;
}

function objectCatchall(schema: AnySchema): AnySchema | null {
  const catchall = schemaDef(schema).catchall as AnySchema | undefined;

  if (catchall === undefined || schemaType(catchall) === "never") {
    return null;
  }

  return catchall;
}

function recordValue(schema: AnySchema, key: string | number): AnySchema | null {
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

function intersectionChild(schema: AnySchema, key: string | number): AnySchema | null {
  const def = schemaDef(schema);
  const left = def.left as AnySchema | undefined;
  const right = def.right as AnySchema | undefined;

  if (left === undefined || right === undefined) {
    return null;
  }

  const leftChild = schemaChild(left, key);
  const rightChild = schemaChild(right, key);

  if (leftChild === null) {
    return rightChild;
  }

  if (rightChild === null) {
    return leftChild;
  }

  return z.intersection(leftChild, rightChild);
}

function pipeChild(schema: AnySchema, key: string | number): AnySchema | null {
  const def = schemaDef(schema);
  const output = def.out as AnySchema | undefined;
  const input = def.in as AnySchema | undefined;

  if (output !== undefined) {
    const outputChild = schemaChild(output, key);

    if (outputChild !== null) {
      return outputChild;
    }
  }

  return input === undefined ? null : schemaChild(input, key);
}

function recordKeyMatches(keySchema: AnySchema, key: string): boolean {
  if (keySchema.safeParse(key).success) {
    return true;
  }

  if (schemaType(unwrapTransparent(keySchema)) !== "number") {
    return false;
  }

  const numericKey = Number(key);

  return Number.isFinite(numericKey) && keySchema.safeParse(numericKey).success;
}

function objectShape(schema: AnySchema): Record<string, AnySchema> {
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

function unionOptions(schema: AnySchema): AnySchema[] {
  const options = (schema as { options?: AnySchema[] }).options;

  if (options !== undefined) {
    return options;
  }

  const def = schemaDef(schema);
  return (def.options as AnySchema[] | undefined) ?? [];
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

  return (
    schemaWithDef.def ??
    schemaWithDef._def ??
    {}
  );
}
