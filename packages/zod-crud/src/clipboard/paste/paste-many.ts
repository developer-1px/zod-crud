import * as z from "zod";

import type { JsonDoc, JsonValue, NodeId } from "../../types.js";
import { cloneDoc, ensureObjectArrayField, getNode, insertChild } from "../../document/json-doc.js";
import { objectArrayFieldKeysOfTarget } from "../../schema/schema-array-fields.js";
import type { PastePlan } from "./paste-plan.js";

export function childPasteManyPlans(
  doc: JsonDoc,
  schema: z.ZodType<unknown>,
  targetId: NodeId,
  payloads: JsonValue[],
  childKeys: string[],
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan[] {
  const target = getNode(doc, targetId);

  if (target.type === "array") {
    return [arrayInsertManyPastePlan(doc, targetId, payloads, index, allocateNodeId)];
  }

  if (target.parentId !== null) {
    const parent = getNode(doc, target.parentId);

    if (parent.type === "array") {
      const targetIndex = parent.children.indexOf(targetId);

      if (targetIndex >= 0) {
        return [arrayInsertManyPastePlan(doc, parent.id, payloads, index ?? targetIndex + 1, allocateNodeId)];
      }
    }
  }

  if (target.type !== "object") {
    return [];
  }

  return objectArrayFieldKeysOfTarget(doc, schema, target, childKeys).map((childKey) =>
    objectChildArrayPasteManyPlan(doc, targetId, childKey, payloads, index, allocateNodeId),
  );
}

function objectChildArrayPasteManyPlan(
  doc: JsonDoc,
  targetId: NodeId,
  childKey: string,
  payloads: JsonValue[],
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan {
  return {
    apply: () => {
      const next = cloneDoc(doc);
      const childArrayId = ensureObjectArrayField(next, targetId, childKey, allocateNodeId);
      const pastedRootIds = insertManyChildren(
        next,
        childArrayId,
        index ?? getNode(next, childArrayId).children.length,
        payloads,
        allocateNodeId,
      );

      return { doc: next, pastedRootId: pastedRootIds[0]!, pastedRootIds };
    },
  };
}

function arrayInsertManyPastePlan(
  doc: JsonDoc,
  arrayId: NodeId,
  payloads: JsonValue[],
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan {
  return {
    apply: () => {
      const next = cloneDoc(doc);
      const pastedRootIds = insertManyChildren(
        next,
        arrayId,
        index ?? getNode(next, arrayId).children.length,
        payloads,
        allocateNodeId,
      );

      return { doc: next, pastedRootId: pastedRootIds[0]!, pastedRootIds };
    },
  };
}

function insertManyChildren(
  doc: JsonDoc,
  arrayId: NodeId,
  startIndex: number,
  payloads: JsonValue[],
  allocateNodeId: () => NodeId,
): NodeId[] {
  return payloads.map((payload, offset) =>
    insertChild(doc, arrayId, startIndex + offset, payload, allocateNodeId),
  );
}
