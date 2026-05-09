import * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import {
  cloneDoc,
  deserialize,
  getNode,
  getPath,
  removeSubtree,
} from "../document/json-doc.js";
import { validateAtPath } from "../schema/json-validation.js";
import { focusAfterSiblingBatchRemoval } from "./delete-many-focus.js";
import { sortBySiblingIndexDescending } from "./delete-many-order.js";
import { changesForDeletedSubtrees } from "./json-change-diff.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type DeleteManyPlan = {
  ok: true;
  next: JsonDoc;
  changes: JsonChange[];
  focusNodeId: NodeId;
  nodeId?: NodeId;
};

export function uniqueNodes(doc: JsonDoc, nodeIds: NodeId[]): JsonNode[] {
  const seen = new Set<NodeId>();
  const nodes: JsonNode[] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      continue;
    }

    seen.add(nodeId);
    nodes.push(getNode(doc, nodeId));
  }

  return nodes;
}

export function planDeleteMany<T extends JsonValue>(args: {
  doc: JsonDoc;
  schema: z.ZodType<T, any>;
  nodeIds: NodeId[];
  focusFilter?: FocusFilter;
}): DeleteManyPlan | OperationFailure {
  const { doc, schema, nodeIds, focusFilter } = args;
  const nodes = uniqueNodes(doc, nodeIds);

  if (nodes.length === 0) {
    return { ok: false, reason: "No nodes to delete." };
  }

  if (nodes.some((node) => node.id === doc.rootId || node.parentId === null)) {
    return { ok: false, reason: "Cannot delete the root node." };
  }

  const parentId = nodes[0]?.parentId;

  if (parentId === null || parentId === undefined) {
    return { ok: false, reason: "Cannot delete a node without a parent." };
  }

  if (nodes.some((node) => node.parentId !== parentId)) {
    return { ok: false, reason: "deleteMany only accepts sibling nodes." };
  }

  const parentPath = getPath(doc, parentId);
  const next = cloneDoc(doc);
  const sortedNodes = sortBySiblingIndexDescending(doc, parentId, nodes);

  for (const node of sortedNodes) {
    removeSubtree(next, node.id);
  }

  const validation = validateAtPath(schema, parentPath, deserialize(next, parentId));

  if (!validation.ok) {
    return validation;
  }

  const changes = changesForDeletedSubtrees(doc, next, sortedNodes.map((node) => node.id));
  const focusNodeId = focusAfterSiblingBatchRemoval(
    doc,
    next,
    parentId,
    sortedNodes.map((node) => node.id),
    focusFilter,
  );
  const nodeId = sortedNodes[0]?.id;

  return {
    ok: true,
    next,
    changes,
    focusNodeId,
    ...(nodeId === undefined ? {} : { nodeId }),
  };
}
