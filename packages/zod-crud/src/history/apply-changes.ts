import type { JsonChange, JsonDoc, JsonNode, NodeId } from "../types.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { cloneNode } from "./change/change-nodes.js";

export type ApplyChangesResult =
  | { ok: true; next: JsonDoc }
  | { ok: false; conflict: NodeId; reason: string };

export function applyChangesToDoc(doc: JsonDoc, changes: JsonChange[]): ApplyChangesResult {
  const next = cloneDoc(doc);

  for (const change of changes) {
    if (change.type === "insert") {
      if (next.nodes[change.nodeId] !== undefined) {
        return {
          ok: false,
          conflict: change.nodeId,
          reason: `Cannot apply insert: node ${change.nodeId} already exists.`,
        };
      }
      next.nodes[change.nodeId] = cloneNode(change.after);
      continue;
    }

    if (change.type === "delete") {
      const current = next.nodes[change.nodeId];
      if (current === undefined) {
        return {
          ok: false,
          conflict: change.nodeId,
          reason: `Cannot apply delete: node ${change.nodeId} does not exist.`,
        };
      }
      if (!sameNode(current, change.before)) {
        return {
          ok: false,
          conflict: change.nodeId,
          reason: `Cannot apply delete: node ${change.nodeId} does not match expected before-state.`,
        };
      }
      delete next.nodes[change.nodeId];
      continue;
    }

    // update
    const current = next.nodes[change.nodeId];
    if (current === undefined) {
      return {
        ok: false,
        conflict: change.nodeId,
        reason: `Cannot apply update: node ${change.nodeId} does not exist.`,
      };
    }
    if (!sameNode(current, change.before)) {
      return {
        ok: false,
        conflict: change.nodeId,
        reason: `Cannot apply update: node ${change.nodeId} does not match expected before-state.`,
      };
    }
    next.nodes[change.nodeId] = cloneNode(change.after);
  }

  return { ok: true, next };
}

function sameNode(left: JsonNode, right: JsonNode): boolean {
  return left.type === right.type &&
    left.parentId === right.parentId &&
    left.key === right.key &&
    left.value === right.value &&
    left.children.length === right.children.length &&
    left.children.every((childId, index) => childId === right.children[index]);
}
