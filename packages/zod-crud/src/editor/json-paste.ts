import * as z from "zod";

import type {
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
  PasteOptions,
} from "../types.js";
import {
  cloneDoc,
  ensureObjectArrayField,
  getNode,
  getPath,
  insertChild,
  replaceSubtree,
} from "../document/json-doc.js";
import { objectArrayFieldKeys, schemaAtPath } from "../schema/schema-path.js";

export type PasteCandidate = {
  apply: () => {
    doc: JsonDoc;
    pastedRootId: NodeId;
  };
};

export function buildPasteCandidates({
  doc,
  schema,
  targetId,
  payload,
  mode,
  childKeys,
  clipboardSourceId,
  index,
  allocateNodeId,
}: {
  doc: JsonDoc;
  schema: z.ZodType<unknown>;
  targetId: NodeId;
  payload: JsonValue;
  mode: PasteOptions["mode"];
  childKeys: string[];
  clipboardSourceId: NodeId | null;
  index: number | undefined;
  allocateNodeId: () => NodeId;
}): PasteCandidate[] {
  const target = getNode(doc, targetId);

  if (mode === "overwrite") {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  if (mode === "child") {
    return childPasteCandidates(doc, schema, targetId, payload, childKeys, index, allocateNodeId);
  }

  const selfSiblingCandidates = selfSiblingPasteCandidates(
    doc,
    clipboardSourceId,
    targetId,
    payload,
    index,
    allocateNodeId,
  );
  const childCandidates = childPasteCandidates(doc, schema, targetId, payload, childKeys, index, allocateNodeId);

  if (selfSiblingCandidates.length > 0) {
    return [...selfSiblingCandidates, ...childCandidates];
  }

  if (target.type === "array") {
    return childCandidates;
  }

  if (target.type === "object") {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  if (target.type === jsonNodeTypeOf(payload)) {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  return [];
}

function overwritePasteCandidate(
  doc: JsonDoc,
  targetId: NodeId,
  payload: JsonValue,
  allocateNodeId: () => NodeId,
): PasteCandidate {
  return {
    apply: () => {
      const next = cloneDoc(doc);

      replaceSubtree(next, targetId, payload, allocateNodeId);
      return { doc: next, pastedRootId: targetId };
    },
  };
}

function selfSiblingPasteCandidates(
  doc: JsonDoc,
  clipboardSourceId: NodeId | null,
  targetId: NodeId,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PasteCandidate[] {
  if (clipboardSourceId !== targetId) {
    return [];
  }

  const target = getNode(doc, targetId);

  if (target.parentId === null) {
    return [];
  }

  const parent = getNode(doc, target.parentId);

  if (parent.type !== "array") {
    return [];
  }

  const targetIndex = parent.children.indexOf(targetId);

  if (targetIndex === -1) {
    return [];
  }

  return [arrayInsertPasteCandidate(doc, parent.id, payload, index ?? targetIndex + 1, allocateNodeId)];
}

function childPasteCandidates(
  doc: JsonDoc,
  schema: z.ZodType<unknown>,
  targetId: NodeId,
  payload: JsonValue,
  childKeys: string[],
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PasteCandidate[] {
  const target = getNode(doc, targetId);

  if (target.type === "array") {
    return [arrayInsertPasteCandidate(doc, targetId, payload, index, allocateNodeId)];
  }

  if (target.type !== "object") {
    return [];
  }

  return objectChildArrayKeys(doc, schema, target, childKeys).map((childKey) =>
    objectChildArrayPasteCandidate(doc, targetId, childKey, payload, index, allocateNodeId),
  );
}

function objectChildArrayPasteCandidate(
  doc: JsonDoc,
  targetId: NodeId,
  childKey: string,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PasteCandidate {
  return {
    apply: () => {
      const next = cloneDoc(doc);
      const childArrayId = ensureObjectArrayField(next, targetId, childKey, allocateNodeId);

      const pastedRootId = insertChild(
        next,
        childArrayId,
        index ?? getNode(next, childArrayId).children.length,
        payload,
        allocateNodeId,
      );
      return { doc: next, pastedRootId };
    },
  };
}

function arrayInsertPasteCandidate(
  doc: JsonDoc,
  arrayId: NodeId,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PasteCandidate {
  return {
    apply: () => {
      const next = cloneDoc(doc);

      const pastedRootId = insertChild(
        next,
        arrayId,
        index ?? getNode(next, arrayId).children.length,
        payload,
        allocateNodeId,
      );
      return { doc: next, pastedRootId };
    },
  };
}

function objectChildArrayKeys(
  doc: JsonDoc,
  schema: z.ZodType<unknown>,
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

function jsonNodeTypeOf(value: JsonValue): JsonNode["type"] {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "object") {
    return "object";
  }

  if (typeof value === "string") {
    return "string";
  }

  if (typeof value === "number") {
    return "number";
  }

  return "boolean";
}
