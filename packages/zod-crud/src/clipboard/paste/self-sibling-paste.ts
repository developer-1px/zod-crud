import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../../types.js";
import { getNode } from "../../document/json-doc.js";
import { arrayInsertPastePlan } from "./array-paste.js";
import type { PastePlan } from "./paste-plan.js";

export function selfSiblingPastePlans(
  doc: JsonDoc,
  clipboardSourceId: NodeId | null,
  targetId: NodeId,
  payload: JsonValue,
  index: number | undefined,
  allocateNodeId: () => NodeId,
): PastePlan[] {
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

  return [arrayInsertPastePlan(doc, parent.id, payload, index ?? targetIndex + 1, allocateNodeId)];
}
