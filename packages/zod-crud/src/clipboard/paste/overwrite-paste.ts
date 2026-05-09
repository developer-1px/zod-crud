import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../../types.js";
import {
  cloneDoc,
  replaceSubtree,
} from "../../document/json-doc.js";
import type { PastePlan } from "./paste-plan.js";

export function overwritePastePlan(
  doc: JsonDoc,
  targetId: NodeId,
  payload: JsonValue,
  allocateNodeId: () => NodeId,
): PastePlan {
  return {
    apply: () => {
      const next = cloneDoc(doc);

      replaceSubtree(next, targetId, payload, allocateNodeId);
      return { doc: next, pastedRootId: targetId, pastedRootIds: [targetId] };
    },
  };
}
