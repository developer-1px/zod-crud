import * as z from "zod";

import type { JsonPath } from "../types.js";
import {
  type AnySchema,
  objectShape,
  recordKeyMatches,
  schemaAllowsArray,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";

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
