import type {
  JsonDoc,
  NodeId,
} from "../types.js";

export type PastePlan = {
  apply: () => {
    doc: JsonDoc;
    pastedRootId: NodeId;
    pastedRootIds: NodeId[];
  };
};
