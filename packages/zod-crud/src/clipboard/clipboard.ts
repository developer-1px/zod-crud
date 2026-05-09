import * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
  PasteOptions,
} from "../types.js";
import { cloneDoc, cloneJson } from "../document/json-doc-clone.js";
import { validateDocument } from "../validation.js";
import { successResult } from "../result.js";
import {
  changesForInsertedSubtrees,
  changesForReplacedSubtree,
} from "../history/change/change-diff.js";
import { buildPastePlans, buildPasteManyPlans, type PastePlan } from "./paste/dispatch.js";
import { uniqueNodes } from "../mutate/delete-many.js";
import { failure } from "../result.js";

type Clipboard = {
  values: JsonValue[];
  sourceIds: NodeId[] | null;
};

export type ClipboardDeps<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  getDoc: () => JsonDoc;
  read: (nodeId: NodeId) => JsonValue;
  deleteNode: (nodeId: NodeId) => OperationResult;
  deleteMany: (nodeIds: NodeId[]) => OperationResult;
  canDeleteMany: (nodeIds: NodeId[]) => OperationResult;
  allocateNodeId: () => NodeId;
  saveAllocator: () => number;
  restoreAllocator: (saved: number) => void;
  commit: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => void;
  focusFilter?: FocusFilter;
};

export type ClipboardApi = {
  copy: (nodeId: NodeId) => JsonValue;
  copyMany: (nodeIds: NodeId[]) => JsonValue[];
  canCopyMany: (nodeIds: NodeId[]) => OperationResult;
  cut: (nodeId: NodeId) => OperationResult;
  cutMany: (nodeIds: NodeId[]) => OperationResult;
  canCutMany: (nodeIds: NodeId[]) => OperationResult;
  paste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
  canPaste: (targetId: NodeId, options?: PasteOptions) => OperationResult;
};

export function createClipboard<T extends JsonValue>(deps: ClipboardDeps<T>): ClipboardApi {
  const {
    schema, childKeys, getDoc, read,
    deleteNode, deleteMany, canDeleteMany,
    allocateNodeId, saveAllocator, restoreAllocator,
    commit, focusFilter,
  } = deps;
  let clipboard: Clipboard | null = null;

  function copy(nodeId: NodeId): JsonValue {
    const value = read(nodeId);
    clipboard = { values: [value], sourceIds: [nodeId] };
    return cloneJson(value);
  }

  function copyMany(nodeIds: NodeId[]): JsonValue[] {
    const nodes = uniqueNodes(getDoc(), nodeIds);

    if (nodes.length === 0) {
      throw new Error("No nodes to copy.");
    }

    const values = nodes.map((node) => read(node.id));

    clipboard = { values, sourceIds: nodes.map((node) => node.id) };
    return cloneJson(values);
  }

  function canCopyMany(nodeIds: NodeId[]): OperationResult {
    try {
      const nodes = uniqueNodes(getDoc(), nodeIds);

      return nodes.length === 0 ? { ok: false, code: "empty_selection", reason: "No nodes to copy." } : { ok: true };
    } catch (error) {
      return failure(error);
    }
  }

  function cut(nodeId: NodeId): OperationResult {
    if (nodeId === getDoc().rootId) {
      return { ok: false, code: "root_operation", reason: "Cannot cut the root node.", nodeId };
    }

    try {
      const value = read(nodeId);
      const result = deleteNode(nodeId);

      if (result.ok) {
        clipboard = { values: [value], sourceIds: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  function cutMany(nodeIds: NodeId[]): OperationResult {
    try {
      const nodes = uniqueNodes(getDoc(), nodeIds);
      const values = nodes.map((node) => read(node.id));
      const result = deleteMany(nodes.map((node) => node.id));

      if (result.ok) {
        clipboard = { values, sourceIds: null };
      }

      return result;
    } catch (error) {
      return failure(error);
    }
  }

  function canCutMany(nodeIds: NodeId[]): OperationResult {
    return canDeleteMany(nodeIds);
  }

  function paste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    try {
      if (clipboard === null) {
        return { ok: false, code: "clipboard_empty", reason: "Clipboard is empty." };
      }

      const plans = buildPlans(targetId, cloneJson(clipboard.values), options);
      return commitFirstValidPaste(plans);
    } catch (error) {
      return failure(error);
    }
  }

  function canPaste(targetId: NodeId, options: PasteOptions = {}): OperationResult {
    if (clipboard === null) {
      return { ok: false, code: "clipboard_empty", reason: "Clipboard is empty." };
    }

    const initialNodeIndex = saveAllocator();

    try {
      const plans = buildPlans(targetId, cloneJson(clipboard.values), options);
      const result = firstValidPasteResult(plans);

      return result.ok ? { ok: true } : result;
    } catch (error) {
      return failure(error);
    } finally {
      restoreAllocator(initialNodeIndex);
    }
  }

  function buildPlans(
    targetId: NodeId,
    payloads: JsonValue[],
    pasteOptions: PasteOptions,
  ): PastePlan[] {
    const doc = getDoc();

    if (payloads.length !== 1) {
      return buildPasteManyPlans({
        doc,
        schema,
        targetId,
        payloads,
        mode: pasteOptions.mode ?? "auto",
        childKeys: pasteOptions.childKeys ?? childKeys,
        index: pasteOptions.index,
        allocateNodeId,
      });
    }

    return buildPastePlans({
      doc,
      schema,
      targetId,
      payload: payloads[0]!,
      mode: pasteOptions.mode ?? "auto",
      childKeys: pasteOptions.childKeys ?? childKeys,
      clipboardSourceId: clipboard?.sourceIds?.[0] ?? null,
      index: pasteOptions.index,
      allocateNodeId,
    });
  }

  function commitFirstValidPaste(plans: PastePlan[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = saveAllocator();

    for (const plan of plans) {
      const planNodeIndex = saveAllocator();

      try {
        const { doc: next, pastedRootId, pastedRootIds } = plan.apply();
        const validation = validateDocument(schema, next);

        if (validation.ok) {
          const before = cloneDoc(getDoc());
          const changes = pastedRootIds.some((nodeId) => before.nodes[nodeId] === undefined)
            ? changesForInsertedSubtrees(before, next, pastedRootIds)
            : changesForReplacedSubtree(before, next, pastedRootId);

          const focusNodeIds = pastedRootIds.length > 1 ? pastedRootIds : undefined;
          const focusNodeId = pastedRootIds[pastedRootIds.length - 1] ?? pastedRootId;

          commit(next, changes, pastedRootId, focusNodeId, focusNodeIds);
          clipboard = clipboard === null
            ? null
            : { values: cloneJson(clipboard.values), sourceIds: pastedRootIds };
          return successResult(before, next, changes, pastedRootId, focusNodeId, focusNodeIds, focusFilter);
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      restoreAllocator(planNodeIndex);
    }

    restoreAllocator(initialNodeIndex);
    return lastFailure ?? { ok: false, code: "invalid_target", reason: "No paste plan accepted the clipboard payload." };
  }

  function firstValidPasteResult(plans: PastePlan[]): OperationResult {
    let lastFailure: OperationResult | null = null;
    const initialNodeIndex = saveAllocator();

    for (const plan of plans) {
      const planNodeIndex = saveAllocator();

      try {
        const validation = validateDocument(schema, plan.apply().doc);

        if (validation.ok) {
          restoreAllocator(initialNodeIndex);
          return { ok: true };
        }

        lastFailure = validation;
      } catch (error) {
        lastFailure = failure(error);
      }

      restoreAllocator(planNodeIndex);
    }

    restoreAllocator(initialNodeIndex);
    return lastFailure ?? { ok: false, code: "invalid_target", reason: "No paste plan accepted the clipboard payload." };
  }

  return { copy, copyMany, canCopyMany, cut, cutMany, canCutMany, paste, canPaste };
}
