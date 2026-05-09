import * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import {
  cloneDoc,
  deserialize,
  getPath,
  removeSubtree,
} from "../document/json-doc.js";
import { validateAtPath } from "../validation/json-validation.js";
import { focusAfterSiblingBatchRemoval } from "../focus/delete-many-focus.js";
import { sortBySiblingIndexDescending } from "./delete-many-order.js";
import { changesForDeletedSubtrees } from "../mutate/diff/change-diff.js";
import { select } from "./select.js";

export { uniqueNodes } from "./select.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type DeleteManyPlan = {
  ok: true;
  next: JsonDoc;
  changes: JsonChange[];
  focusNodeId: NodeId;
  nodeId?: NodeId;
};

export function planDeleteMany<T extends JsonValue>(args: {
  doc: JsonDoc;
  schema: z.ZodType<T, any>;
  nodeIds: NodeId[];
  focusFilter?: FocusFilter;
}): DeleteManyPlan | OperationFailure {
  const { doc, schema, nodeIds, focusFilter } = args;
  const selection = select(doc, nodeIds);

  if (!selection.ok) {
    return selection.code === "empty_selection"
      ? { ok: false, code: "empty_selection", reason: "No nodes to delete." }
      : selection;
  }

  const nodes = selection.nodes;

  if (nodes.some((node) => node.id === doc.rootId || node.parentId === null)) {
    return { ok: false, code: "root_operation", reason: "Cannot delete the root node." };
  }

  const parentId = nodes[0]?.parentId;

  if (parentId === null || parentId === undefined) {
    return { ok: false, code: "invalid_target", reason: "Cannot delete a node without a parent." };
  }

  if (nodes.some((node) => node.parentId !== parentId)) {
    return { ok: false, code: "invalid_target", reason: "deleteMany only accepts sibling nodes." };
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
