import * as z from "zod";

import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../../types.js";
import { ensureObjectArrayField } from "../../document/ensure-object-array-field.js";
import { getNode } from "../../document/json-doc-access.js";
import { cloneDoc } from "../../document/json-doc-clone.js";
import { insertChild } from "../../document/json-doc-mutations.js";
import { arrayInsertPastePlan } from "./array-paste.js";
import type { PastePlan } from "./plan.js";
import { objectArrayFieldKeysOfTarget } from "../../schema/schema-array-fields.js";

export function childPastePlans(
  doc: JsonDoc,
  schema: z.ZodType<unknown>,
  targetId: NodeId,
  payload: JsonValue,
  childKeys: string[],
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan[] {
  const target = getNode(doc, targetId);

  if (target.type === "array") {
    return [arrayInsertPastePlan(doc, targetId, payload, index, allocateNodeId)];
  }

  if (target.type !== "object") {
    return [];
  }

  return objectArrayFieldKeysOfTarget(doc, schema, target, childKeys).map((childKey) =>
    objectChildArrayPastePlan(doc, targetId, childKey, payload, index, allocateNodeId),
  );
}

function objectChildArrayPastePlan(
  doc: JsonDoc,
  targetId: NodeId,
  childKey: string,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan {
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
