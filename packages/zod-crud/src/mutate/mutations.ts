import * as z from "zod";

import type {
  JsonChange,
  JsonDoc,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import { getNode, getPath } from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { insertChild, removeSubtree, renameObjectKey, replaceSubtree } from "../document/json-doc-mutations.js";
import { deserialize } from "../document/json-doc-serialization.js";
import { validateAtPath } from "../validation.js";
import {
  changesForDeletedSubtree,
  changesForInsertedSubtree,
  changesForReplacedSubtree,
} from "../history/change/change-diff.js";
import { failure } from "../result.js";
import { childArrayIdForObjectAppend, resolveCreateValue } from "./create-helpers.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;

export type MutationPlan =
  | { ok: true; next: JsonDoc; changes: JsonChange[]; nodeId: NodeId }
  | OperationFailure;

export type MutationsCtx<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  allocateNodeId: () => NodeId;
  defaultFor?: (path: JsonPath) => JsonValue;
};

function defaulted<T extends JsonValue>(
  ctx: MutationsCtx<T>,
  parentPath: JsonPath,
  key: string | number,
  value: JsonValue | undefined,
) {
  return resolveCreateValue({
    schema: ctx.schema,
    parentPath,
    key,
    value,
    ...(ctx.defaultFor && { defaultFor: ctx.defaultFor }),
  });
}

export function planCreate<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  parentId: NodeId,
  key: string | number,
  value?: JsonValue,
): MutationPlan {
  try {
    const next = cloneDoc(doc);
    const parentPath = getPath(next, parentId);
    const childValue = defaulted(ctx, parentPath, key, value);

    if (!childValue.ok) {
      return childValue;
    }

    const nodeId = insertChild(next, parentId, key, childValue.value, ctx.allocateNodeId);
    const validation = validateAtPath(ctx.schema, parentPath, deserialize(next, parentId));

    if (!validation.ok) {
      return validation;
    }

    return { ok: true, next, changes: changesForInsertedSubtree(doc, next, nodeId), nodeId };
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

function planInsertAtSibling<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  siblingId: NodeId,
  value: JsonValue | undefined,
  offset: 0 | 1,
  method: "insertAfter" | "insertBefore",
): MutationPlan {
  try {
    const sibling = getNode(doc, siblingId);

    if (sibling.parentId === null) {
      return { ok: false, code: "root_operation", reason: "Cannot insert next to the root node.", nodeId: siblingId };
    }

    const parent = getNode(doc, sibling.parentId);

    if (parent.type !== "array") {
      return { ok: false, code: "invalid_target", reason: `${method} requires a sibling whose parent is an array.`, nodeId: siblingId };
    }

    const index = parent.children.indexOf(siblingId);

    if (index < 0) {
      return { ok: false, code: "invalid_target", reason: "Sibling is not present in its parent.", nodeId: siblingId };
    }

    return planCreate(doc, ctx, parent.id, index + offset, value);
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

export function planInsertAfter<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  siblingId: NodeId,
  value?: JsonValue,
): MutationPlan {
  return planInsertAtSibling(doc, ctx, siblingId, value, 1, "insertAfter");
}

export function planInsertBefore<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  siblingId: NodeId,
  value?: JsonValue,
): MutationPlan {
  return planInsertAtSibling(doc, ctx, siblingId, value, 0, "insertBefore");
}

export function planAppendChild<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  parentId: NodeId,
  value?: JsonValue,
): MutationPlan {
  try {
    const parent = getNode(doc, parentId);
    const next = cloneDoc(doc);
    const childArrayId = parent.type === "array"
      ? parent.id
      : childArrayIdForObjectAppend({ schema: ctx.schema, doc: next, objectId: parent.id, childKeys: ctx.childKeys, allocateNodeId: ctx.allocateNodeId });
    const childArray = getNode(next, childArrayId);
    const childArrayPath = getPath(next, childArrayId);
    const childValue = defaulted(ctx, childArrayPath, childArray.children.length, value);

    if (!childValue.ok) {
      return childValue;
    }

    const nodeId = insertChild(next, childArrayId, childArray.children.length, childValue.value, ctx.allocateNodeId);
    const validationPath = parent.type === "array" ? childArrayPath : getPath(next, parent.id);
    const validationId = parent.type === "array" ? childArrayId : parent.id;
    const validation = validateAtPath(ctx.schema, validationPath, deserialize(next, validationId));

    if (!validation.ok) {
      return validation;
    }

    return { ok: true, next, changes: changesForInsertedSubtree(doc, next, nodeId), nodeId };
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

export function planUpdate<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  nodeId: NodeId,
  value: JsonValue,
): MutationPlan {
  try {
    const path = getPath(doc, nodeId);
    const validation = validateAtPath(ctx.schema, path, value);

    if (!validation.ok) {
      return validation;
    }

    const next = cloneDoc(doc);

    replaceSubtree(next, nodeId, value, ctx.allocateNodeId);
    return { ok: true, next, changes: changesForReplacedSubtree(doc, next, nodeId), nodeId };
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

export function planRename<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  nodeId: NodeId,
  key: string,
): MutationPlan {
  try {
    const node = getNode(doc, nodeId);

    if (node.parentId === null) {
      return { ok: false, code: "root_operation", reason: "Cannot rename the root node.", nodeId };
    }

    const parent = getNode(doc, node.parentId);

    if (parent.type !== "object") {
      return { ok: false, code: "invalid_target", reason: "Only object child keys can be renamed.", nodeId };
    }

    const parentPath = getPath(doc, parent.id);
    const next = cloneDoc(doc);

    renameObjectKey(next, nodeId, key);
    const validation = validateAtPath(ctx.schema, parentPath, deserialize(next, parent.id));

    if (!validation.ok) {
      return validation;
    }

    return { ok: true, next, changes: changesForReplacedSubtree(doc, next, nodeId), nodeId };
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

export function planDelete<T extends JsonValue>(
  doc: JsonDoc,
  ctx: MutationsCtx<T>,
  nodeId: NodeId,
): MutationPlan {
  if (nodeId === doc.rootId) {
    return { ok: false, code: "root_operation", reason: "Cannot delete the root node.", nodeId };
  }

  try {
    const node = getNode(doc, nodeId);
    const parentId = node.parentId;

    if (parentId === null) {
      return { ok: false, code: "invalid_target", reason: "Cannot delete a node without a parent.", nodeId };
    }

    const parentPath = getPath(doc, parentId);
    const next = cloneDoc(doc);

    removeSubtree(next, nodeId);
    const validation = validateAtPath(ctx.schema, parentPath, deserialize(next, parentId));

    if (!validation.ok) {
      return validation;
    }

    return { ok: true, next, changes: changesForDeletedSubtree(doc, next, nodeId), nodeId };
  } catch (error) {
    return failure(error) as OperationFailure;
  }
}

export type MutationsDeps<T extends JsonValue> = MutationsCtx<T> & {
  getDoc: () => JsonDoc;
  commitIfValid: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => OperationResult;
};

export type MutationsApi = {
  create: (parentId: NodeId, key: string | number, value?: JsonValue) => OperationResult;
  insertAfter: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  insertBefore: (siblingId: NodeId, value?: JsonValue) => OperationResult;
  appendChild: (parentId: NodeId, value?: JsonValue) => OperationResult;
  update: (nodeId: NodeId, value: JsonValue) => OperationResult;
  rename: (nodeId: NodeId, key: string) => OperationResult;
  delete: (nodeId: NodeId) => OperationResult;
};

export function createMutations<T extends JsonValue>(deps: MutationsDeps<T>): MutationsApi {
  const { getDoc, commitIfValid, schema, childKeys, allocateNodeId, defaultFor } = deps;
  const ctx: MutationsCtx<T> = {
    schema,
    childKeys,
    allocateNodeId,
    ...(defaultFor && { defaultFor }),
  };

  function commit(plan: MutationPlan): OperationResult {
    if (!plan.ok) return plan;
    return commitIfValid(plan.next, plan.changes, plan.nodeId);
  }

  return {
    create: (parentId, key, value) => commit(planCreate(getDoc(), ctx, parentId, key, value)),
    insertAfter: (siblingId, value) => commit(planInsertAfter(getDoc(), ctx, siblingId, value)),
    insertBefore: (siblingId, value) => commit(planInsertBefore(getDoc(), ctx, siblingId, value)),
    appendChild: (parentId, value) => commit(planAppendChild(getDoc(), ctx, parentId, value)),
    update: (nodeId, value) => commit(planUpdate(getDoc(), ctx, nodeId, value)),
    rename: (nodeId, key) => commit(planRename(getDoc(), ctx, nodeId, key)),
    delete: (nodeId) => commit(planDelete(getDoc(), ctx, nodeId)),
  };
}
