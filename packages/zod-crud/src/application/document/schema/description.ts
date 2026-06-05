import { toJSONSchema, type z } from "zod";

import {
  getDiscriminatedUnionInfo,
} from "../../../domain/schema/introspection.js";
import {
  getArrayElement,
  getDef,
  getEnumValues,
  getLiteralValues,
  getObjectKeys,
  getObjectShape,
} from "../../../domain/schema/zod.js";

export type SchemaKind =
  | "unknown"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "literal"
  | "enum"
  | "object"
  | "array"
  | "record"
  | "union"
  | "discriminatedUnion"
  | "optional"
  | "nullable"
  | "any";

export interface SchemaDescription {
  kind: SchemaKind;
  jsonSchema: unknown;
  keys?: string[];
  elementKind?: SchemaKind;
  valueKind?: SchemaKind;
  discriminator?: string;
  allowed?: unknown[];
}

export function describeSchema(schema: z.ZodType): SchemaDescription {
  const kind = schemaKind(schema);
  const description: SchemaDescription = {
    kind,
    jsonSchema: safeJSONSchema(schema),
  };

  const keys = getObjectKeys(schema);
  if (keys) description.keys = keys;

  const element = getArrayElement(schema);
  if (element) description.elementKind = schemaKind(element);

  const def = getDef(schema);
  if (def.type === "record" && def.valueType) {
    description.valueKind = schemaKind(def.valueType);
  }

  const du = getDiscriminatedUnionInfo(schema);
  if (du) {
    description.discriminator = du.discriminator;
    description.allowed = [...du.allowed];
  }

  const enumValues = getEnumValues(schema);
  if (enumValues) description.allowed = enumValues;
  const literalValues = getLiteralValues(schema);
  if (literalValues) description.allowed = literalValues;

  return description;
}

function schemaKind(schema: z.ZodType): SchemaKind {
  if (getDiscriminatedUnionInfo(schema)) return "discriminatedUnion";
  if (getArrayElement(schema)) return "array";
  if (getObjectShape(schema)) return "object";

  const def = getDef(schema);
  if (def.type === "record") return "record";
  if (def.type === "string") return "string";
  if (def.type === "number") return "number";
  if (def.type === "boolean") return "boolean";
  if (def.type === "null") return "null";
  if (def.type === "literal") return "literal";
  if (def.type === "enum") return "enum";
  if (def.type === "union") return "union";
  if (def.type === "optional") return "optional";
  if (def.type === "nullable") return "nullable";
  if (def.type === "any" || def.type === "unknown") return "any";
  return "unknown";
}

function safeJSONSchema(schema: z.ZodType): unknown {
  try {
    return JSON.parse(JSON.stringify(toJSONSchema(schema)));
  } catch {
    return null;
  }
}
