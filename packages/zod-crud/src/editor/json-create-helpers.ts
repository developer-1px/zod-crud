import * as z from "zod";

import type { JsonDoc, JsonNode, JsonPath, JsonValue, NodeId, OperationResult } from "../types.js";
import { cloneJson, ensureObjectArrayField, getNode, getPath } from "../document/json-doc.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export function resolveCreateValue<T>(args: {
  schema: z.ZodType<T, any>;
  parentPath: JsonPath;
  key: string | number;
  value: JsonValue | undefined;
  defaultFor?: (path: JsonPath) => JsonValue;
}): OperationFailure | { ok: true; value: JsonValue } {
  const { schema, parentPath, key, value, defaultFor } = args;

  if (value !== undefined) {
    return { ok: true, value };
  }

  if (defaultFor !== undefined) {
    return { ok: true, value: cloneJson(defaultFor(parentPath)) };
  }

  const childSchema = schemaAtPath(schema, [...parentPath, key]);
  const parsed = childSchema?.safeParse(undefined);

  if (parsed?.success) {
    return { ok: true, value: cloneJson(parsed.data as JsonValue) };
  }

  return { ok: false, reason: "No default value is configured for create." };
}

export function childArrayIdForObjectAppend<T>(args: {
  schema: z.ZodType<T, any>;
  doc: JsonDoc;
  objectId: NodeId;
  childKeys: string[];
  allocateNodeId: () => NodeId;
}): NodeId {
  const { schema, doc, objectId, childKeys, allocateNodeId } = args;
  const target = getNode(doc, objectId);

  if (target.type !== "object") {
    throw new Error(`Cannot append a child to ${target.type} node.`);
  }

  for (const childKey of objectChildArrayKeys(schema, doc, target, childKeys)) {
    return ensureObjectArrayField(doc, objectId, childKey, allocateNodeId);
  }

  throw new Error("No child array field is available for appendChild.");
}

function objectChildArrayKeys<T>(
  schema: z.ZodType<T, any>,
  doc: JsonDoc,
  target: JsonNode,
  childKeys: string[],
): string[] {
  const keys = new Set<string>();
  const targetSchema = schemaAtPath(schema, getPath(doc, target.id));

  if (targetSchema !== null) {
    for (const childKey of objectArrayFieldKeys(targetSchema)) {
      keys.add(childKey);
    }
  }

  for (const childId of target.children) {
    const child = getNode(doc, childId);

    if (child.type === "array" && typeof child.key === "string") {
      keys.add(child.key);
    }
  }

  for (const childKey of childKeys) {
    keys.add(childKey);
  }

  return [...keys];
}
