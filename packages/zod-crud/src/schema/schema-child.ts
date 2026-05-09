import * as z from "zod";

import {
  type AnySchema,
  objectShape,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";
import {
  arrayElement,
  objectCatchall,
  recordValue,
  tupleElement,
} from "./schema-child-elements.js";

export function schemaChild(schema: AnySchema, key: string | number): AnySchema | null {
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
    return unionChild(current, key);
  }

  return null;
}

function unionChild(schema: AnySchema, key: string | number): AnySchema | null {
  const children = unionOptions(schema)
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
