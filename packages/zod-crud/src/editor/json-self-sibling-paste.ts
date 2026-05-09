import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../types.js";
import { getNode } from "../document/json-doc.js";
import { arrayInsertPasteCandidate } from "./json-array-paste.js";
import type { PasteCandidate } from "./json-paste-candidate.js";

export function selfSiblingPasteCandidates(
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
