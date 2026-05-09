import type {
  JsonDoc,
  NodeId,
} from "../types.js";

export type PasteCandidate = {
  apply: () => {
    doc: JsonDoc;
    pastedRootId: NodeId;
    pastedRootIds: NodeId[];
  };
};
