import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../../types.js";
import { getNode } from "../../document/json-doc-access.js";
import { cloneDoc } from "../../document/json-doc-clone.js";
import { insertChild } from "../../document/json-doc-mutations.js";
import type { PastePlan } from "./plan.js";

export function arrayInsertPastePlan(
  doc: JsonDoc,
  arrayId: NodeId,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan {
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
      return { doc: next, pastedRootId, pastedRootIds: [pastedRootId] };
    },
  };
}
