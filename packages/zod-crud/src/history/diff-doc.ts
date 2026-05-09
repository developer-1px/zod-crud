import type { JsonChange, JsonDoc, JsonNode } from "../types.js";
import { cloneNode } from "./change/change-nodes.js";

export function diffDocs(before: JsonDoc, after: JsonDoc): JsonChange[] {
  const allIds = new Set<string>([
    ...Object.keys(before.nodes),
    ...Object.keys(after.nodes),
  ]);

  const changes: JsonChange[] = [];
  for (const nodeId of allIds) {
    const beforeNode = before.nodes[nodeId];
    const afterNode = after.nodes[nodeId];

    if (beforeNode === undefined && afterNode !== undefined) {
      changes.push({ type: "insert", nodeId, after: cloneNode(afterNode) });
      continue;
    }

    if (beforeNode !== undefined && afterNode === undefined) {
      changes.push({ type: "delete", nodeId, before: cloneNode(beforeNode) });
      continue;
    }

    if (beforeNode !== undefined && afterNode !== undefined && !sameNode(beforeNode, afterNode)) {
      changes.push({
        type: "update",
        nodeId,
        before: cloneNode(beforeNode),
        after: cloneNode(afterNode),
      });
    }
  }

  return changes;
}

function sameNode(left: JsonNode, right: JsonNode): boolean {
  return left.type === right.type &&
    left.parentId === right.parentId &&
    left.key === right.key &&
    left.value === right.value &&
    left.children.length === right.children.length &&
    left.children.every((childId, index) => childId === right.children[index]);
}
