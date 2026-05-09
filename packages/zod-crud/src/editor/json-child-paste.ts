import * as z from "zod";

import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../types.js";
import {
  cloneDoc,
  ensureObjectArrayField,
  getNode,
  insertChild,
} from "../document/json-doc.js";
import { arrayInsertPasteCandidate } from "./json-array-paste.js";
import type { PasteCandidate } from "./json-paste-candidate.js";
import { objectArrayFieldKeysOfTarget } from "./json-paste-shared.js";

export function childPasteCandidates(
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

  return objectArrayFieldKeysOfTarget(doc, schema, target, childKeys).map((childKey) =>
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
      return { doc: next, pastedRootId, pastedRootIds: [pastedRootId] };
    },
  };
}
