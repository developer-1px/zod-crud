import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../types.js";
import {
  cloneDoc,
  replaceSubtree,
} from "../document/json-doc.js";
import type { PasteCandidate } from "./json-paste-candidate.js";

export function overwritePasteCandidate(
  doc: JsonDoc,
  targetId: NodeId,
  payload: JsonValue,
  allocateNodeId: () => NodeId,
): PasteCandidate {
  return {
    apply: () => {
      const next = cloneDoc(doc);

      replaceSubtree(next, targetId, payload, allocateNodeId);
      return { doc: next, pastedRootId: targetId, pastedRootIds: [targetId] };
    },
  };
}
