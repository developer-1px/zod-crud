import * as z from "zod";

import type {
  JsonChange,
  JsonDoc,
  JsonObject,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import { getNode } from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { deserialize } from "../document/json-doc-serialization.js";
import { replaceSubtree } from "../document/json-doc-mutations.js";
import { changesForReplacedSubtree } from "../history/change/change-diff.js";
import { failure } from "../result.js";

export type TreeShapeDeps<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  getDoc: () => JsonDoc;
  commitIfValid: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => OperationResult;
  allocateNodeId: () => NodeId;
};

type MoveFn = (nodeIds: NodeId[], target: NodeId) => OperationResult;

export type TreeShapeApi = {
  wrap: (nodeId: NodeId, key: string) => OperationResult;
  unwrap: (nodeId: NodeId) => OperationResult;
  split: (nodeId: NodeId, at: number) => OperationResult;
  join: (nodeId: NodeId, withId: NodeId) => OperationResult;
  indent: (nodeId: NodeId, moveInto: MoveFn) => OperationResult;
  outdent: (nodeId: NodeId, moveAfter: MoveFn) => OperationResult;
};

export function createTreeShape<T extends JsonValue>(deps: TreeShapeDeps<T>): TreeShapeApi {
  const { getDoc, commitIfValid, allocateNodeId } = deps;
  void deps.schema;
  void deps.childKeys;

  function wrap(nodeId: NodeId, key: string): OperationResult {
    try {
      const doc = getDoc();
      const node = getNode(doc, nodeId);
      if (node.parentId === null) {
        return { ok: false, code: "root_operation", reason: "Cannot wrap the root node.", nodeId };
      }
      const oldValue = deserialize(doc, nodeId);
      const newValue: JsonValue = { [key]: oldValue };
      const next = cloneDoc(doc);
      replaceSubtree(next, nodeId, newValue, allocateNodeId);
      return commitIfValid(next, changesForReplacedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function unwrap(nodeId: NodeId): OperationResult {
    try {
      const doc = getDoc();
      const node = getNode(doc, nodeId);
      if (node.parentId === null) {
        return { ok: false, code: "root_operation", reason: "Cannot unwrap the root node.", nodeId };
      }
      if (node.type !== "object" && node.type !== "array") {
        return { ok: false, code: "invalid_target", reason: "Only object or array nodes can be unwrapped.", nodeId };
      }
      if (node.children.length !== 1) {
        return {
          ok: false,
          code: "invalid_target",
          reason: `unwrap requires exactly 1 child; node has ${node.children.length}.`,
          nodeId,
        };
      }
      const onlyChildValue = deserialize(doc, node.children[0]!);
      const next = cloneDoc(doc);
      replaceSubtree(next, nodeId, onlyChildValue, allocateNodeId);
      return commitIfValid(next, changesForReplacedSubtree(doc, next, nodeId), nodeId);
    } catch (error) {
      return failure(error);
    }
  }

  function split(nodeId: NodeId, at: number): OperationResult {
    try {
      const doc = getDoc();
      const node = getNode(doc, nodeId);
      if (node.type !== "array") {
        return {
          ok: false,
          code: "invalid_target",
          reason: "split requires an array node.",
          nodeId,
        };
      }
      if (node.parentId === null) {
        return { ok: false, code: "root_operation", reason: "Cannot split the root node.", nodeId };
      }
      const parent = getNode(doc, node.parentId);
      if (parent.type !== "array") {
        return {
          ok: false,
          code: "invalid_target",
          reason: "split target's parent must be an array (D9).",
          nodeId,
        };
      }
      if (!Number.isInteger(at) || at < 0 || at > node.children.length) {
        return {
          ok: false,
          code: "invalid_target",
          reason: `split index out of bounds: ${at}.`,
          nodeId,
        };
      }

      const arrValue = deserialize(doc, nodeId) as JsonValue[];
      const left = arrValue.slice(0, at);
      const right = arrValue.slice(at);

      const parentValue = deserialize(doc, parent.id) as JsonValue[];
      const idxInParent = parent.children.indexOf(nodeId);
      const newParentValue: JsonValue[] = [
        ...parentValue.slice(0, idxInParent),
        left,
        right,
        ...parentValue.slice(idxInParent + 1),
      ];

      const next = cloneDoc(doc);
      replaceSubtree(next, parent.id, newParentValue, allocateNodeId);
      return commitIfValid(next, changesForReplacedSubtree(doc, next, parent.id), parent.id);
    } catch (error) {
      return failure(error);
    }
  }

  function join(nodeId: NodeId, withId: NodeId): OperationResult {
    try {
      const doc = getDoc();
      const a = getNode(doc, nodeId);
      const b = getNode(doc, withId);
      if (a.parentId === null || b.parentId === null) {
        return { ok: false, code: "root_operation", reason: "Cannot join root.", nodeId };
      }
      if (a.parentId !== b.parentId) {
        return {
          ok: false,
          code: "invalid_target",
          reason: "join requires same parent.",
          nodeId,
        };
      }
      if (a.type !== b.type) {
        return {
          ok: false,
          code: "invalid_target",
          reason: `join requires same type; got ${a.type} and ${b.type}.`,
          nodeId,
        };
      }
      if (a.type !== "array" && a.type !== "object") {
        return {
          ok: false,
          code: "invalid_target",
          reason: "join requires array or object nodes.",
          nodeId,
        };
      }

      const aValue = deserialize(doc, nodeId);
      const bValue = deserialize(doc, withId);
      let merged: JsonValue;

      if (a.type === "array") {
        merged = [...(aValue as JsonValue[]), ...(bValue as JsonValue[])];
      } else {
        const aObj = aValue as JsonObject;
        const bObj = bValue as JsonObject;
        for (const key of Object.keys(bObj)) {
          if (key in aObj) {
            return {
              ok: false,
              code: "duplicate_key",
              reason: `join produces duplicate key: ${key}.`,
              nodeId,
            };
          }
        }
        merged = { ...aObj, ...bObj };
      }

      const parent = getNode(doc, a.parentId);
      const parentValue = deserialize(doc, parent.id);
      const aIdx = parent.children.indexOf(nodeId);
      const bIdx = parent.children.indexOf(withId);

      let newParentValue: JsonValue;
      if (parent.type === "array") {
        const arr = parentValue as JsonValue[];
        const without = arr.filter((_, i) => i !== aIdx && i !== bIdx);
        const insertAt = Math.min(aIdx, bIdx);
        newParentValue = [
          ...without.slice(0, insertAt),
          merged,
          ...without.slice(insertAt),
        ];
      } else if (parent.type === "object") {
        const obj = { ...(parentValue as JsonObject) };
        const aKey = a.key as string;
        const bKey = b.key as string;
        delete obj[bKey];
        obj[aKey] = merged;
        newParentValue = obj;
      } else {
        return {
          ok: false,
          code: "invalid_target",
          reason: "join's parent must be array or object.",
          nodeId,
        };
      }

      const next = cloneDoc(doc);
      replaceSubtree(next, parent.id, newParentValue, allocateNodeId);
      return commitIfValid(next, changesForReplacedSubtree(doc, next, parent.id), parent.id);
    } catch (error) {
      return failure(error);
    }
  }

  function indent(nodeId: NodeId, moveInto: MoveFn): OperationResult {
    const doc = getDoc();
    const node = doc.nodes[nodeId];
    if (node === undefined) return { ok: false, code: "invalid_target", reason: "Node not found.", nodeId };
    if (node.parentId === null) {
      return { ok: false, code: "root_operation", reason: "Cannot indent root.", nodeId };
    }
    const parent = doc.nodes[node.parentId]!;
    const idx = parent.children.indexOf(nodeId);
    if (idx <= 0) {
      return { ok: false, code: "invalid_target", reason: "No previous sibling to indent into.", nodeId };
    }
    const prevSiblingId = parent.children[idx - 1]!;
    return moveInto([nodeId], prevSiblingId);
  }

  function outdent(nodeId: NodeId, moveAfter: MoveFn): OperationResult {
    const doc = getDoc();
    const node = doc.nodes[nodeId];
    if (node === undefined) return { ok: false, code: "invalid_target", reason: "Node not found.", nodeId };
    if (node.parentId === null) {
      return { ok: false, code: "root_operation", reason: "Cannot outdent root.", nodeId };
    }
    const parent = doc.nodes[node.parentId]!;
    if (parent.parentId === null) {
      return { ok: false, code: "invalid_target", reason: "Cannot outdent: parent is root.", nodeId };
    }
    return moveAfter([nodeId], parent.id);
  }

  return { wrap, unwrap, split, join, indent, outdent };
}
