import type {
  JsonDoc,
  JsonValue,
  NodeId,
} from "../types.js";
import {
  cloneDoc,
  getNode,
  insertChild,
} from "../document/json-doc.js";
import type { PasteCandidate } from "./json-paste-candidate.js";

export function arrayInsertPasteCandidate(
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
      return { doc: next, pastedRootId, pastedRootIds: [pastedRootId] };
    },
  };
}
