import type { JsonChange } from "../../types.js";
import { cloneNode } from "./change-nodes.js";

export function invertChanges(changes: JsonChange[]): JsonChange[] {
  return changes.slice().reverse().map((change) => {
    if (change.type === "insert") {
      return {
        type: "delete",
        nodeId: change.nodeId,
        before: cloneNode(change.after),
      };
    }

    if (change.type === "delete") {
      return {
        type: "insert",
        nodeId: change.nodeId,
        after: cloneNode(change.before),
      };
    }

    return {
      type: "update",
      nodeId: change.nodeId,
      before: cloneNode(change.after),
      after: cloneNode(change.before),
    };
  });
}
