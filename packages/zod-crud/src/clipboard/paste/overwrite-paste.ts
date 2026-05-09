import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../../types.js";
import { cloneDoc } from "../../document/json-doc-clone.js";
import { replaceSubtree } from "../../document/json-doc-mutations.js";
import type { PastePlan } from "./plan.js";

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
