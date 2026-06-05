import type {
  JSONPatchOperation,
} from "zod-crud";

import type {
  OutlineEditChange,
  OutlineNode,
} from "./types.js";

export function copyNodes(nodes: ReadonlyArray<OutlineNode>): ReadonlyArray<OutlineNode> {
  return nodes.map(copyNode);
}

export function copyNode(node: OutlineNode): OutlineNode {
  const copied: OutlineNode = {
    key: node.key,
    path: node.path,
    depth: node.depth,
    entryKind: node.entryKind,
    schemaKind: node.schemaKind,
    childCount: node.childCount,
    expandable: node.expandable,
  };
  if ("value" in node) copied.value = cloneJson(node.value);
  if (node.children !== undefined) copied.children = copyNodes(node.children);
  return copied;
}

export function copyChange(change: OutlineEditChange): OutlineEditChange {
  return {
    ok: true,
    operation: change.operation,
    source: [...change.source],
    operations: cloneJson(change.operations) as JSONPatchOperation[],
  };
}

export function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
