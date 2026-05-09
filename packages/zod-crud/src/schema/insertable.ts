import type { JsonDoc, JsonNodeType, JsonPath, NodeId } from "../types.js";
import type { AnySchema } from "./schema-introspection.js";
import {
  objectShape,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";
import { schemaChild } from "./schema-child.js";
import { arrayElement, recordValue } from "./schema-child-elements.js";
import { getPath } from "../document/json-doc-access.js";
import { schemaAtPath } from "./schema-path.js";

export function enumerateInsertableKeys(
  schema: AnySchema,
  doc: JsonDoc,
  parentId: NodeId,
): string[] {
  const path = getPath(doc, parentId);
  const parentSchema = schemaAtPath(schema, path);
  if (parentSchema === null) return [];
  return enumerateKeysFor(parentSchema, doc, parentId);
}

function enumerateKeysFor(schema: AnySchema, doc: JsonDoc, parentId: NodeId): string[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "object") {
    const shape = objectShape(current);
    const existingKeys = new Set<string>(
      doc.nodes[parentId]?.children
        .map((id) => doc.nodes[id]?.key)
        .filter((k): k is string => typeof k === "string") ?? [],
    );
    return Object.keys(shape).filter((k) => !existingKeys.has(k));
  }

  if (type === "union") {
    const options = unionOptions(current);
    const sets = options.map((opt) => new Set(enumerateKeysFor(opt, doc, parentId)));
    if (sets.length === 0) return [];
    const intersection = [...sets[0]!].filter((k) => sets.every((s) => s.has(k)));
    return intersection;
  }

  return [];
}

export function enumerateInsertableTypes(
  schema: AnySchema,
  doc: JsonDoc,
  parentId: NodeId,
  key?: string,
): JsonNodeType[] {
  const path = getPath(doc, parentId);
  const parentSchema = schemaAtPath(schema, path);
  if (parentSchema === null) return [];
  return enumerateTypesFor(parentSchema, key);
}

function enumerateTypesFor(schema: AnySchema, key: string | undefined): JsonNodeType[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  let childSchema: AnySchema | null = null;

  if (type === "array") {
    childSchema = arrayElement(current);
  } else if (type === "record") {
    childSchema = recordValue(current, key ?? "*");
  } else if (type === "object") {
    if (key === undefined) return [];
    childSchema = schemaChild(current, key);
  } else if (type === "union") {
    const options = unionOptions(current);
    const all = new Set<JsonNodeType>();
    for (const opt of options) {
      for (const t of enumerateTypesFor(opt, key)) all.add(t);
    }
    return [...all];
  } else {
    return [];
  }

  if (childSchema === null) return [];
  return schemaToNodeTypes(childSchema);
}

function schemaToNodeTypes(schema: AnySchema): JsonNodeType[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "string") return ["string"];
  if (type === "number") return ["number"];
  if (type === "boolean") return ["boolean"];
  if (type === "null") return ["null"];
  if (type === "object") return ["object"];
  if (type === "array" || type === "tuple") return ["array"];
  if (type === "record") return ["object"];
  if (type === "literal") {
    const def = (current as unknown as { def?: { values?: unknown[] }; _def?: { values?: unknown[] } });
    const values = def.def?.values ?? def._def?.values;
    if (Array.isArray(values) && values.length > 0) {
      return [literalToNodeType(values[0])];
    }
    return [];
  }
  if (type === "union") {
    const options = unionOptions(current);
    const all = new Set<JsonNodeType>();
    for (const opt of options) {
      for (const t of schemaToNodeTypes(opt)) all.add(t);
    }
    return [...all];
  }
  return [];
}

function literalToNodeType(v: unknown): JsonNodeType {
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (v === null) return "null";
  return "string";
}

// JsonPath imported above is referenced by other type signatures via schemaAtPath.
export type _UsedTypes = JsonPath;
