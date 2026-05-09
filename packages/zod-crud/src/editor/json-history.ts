import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  NodeId,
  OperationResult,
} from "../types.js";
import { cloneDoc } from "../document/json-doc.js";
import { successResult } from "./operation-result.js";
import { invertChanges } from "./json-change-diff.js";

export type HistoryEntry = {
  doc: JsonDoc;
  changes: JsonChange[];
  nodeId?: NodeId;
  focusNodeId?: NodeId;
  focusNodeIds?: NodeId[];
};

export type HistoryDeps = {
  getDoc: () => JsonDoc;
  setDoc: (doc: JsonDoc) => void;
  notify: () => void;
  focusFilter?: FocusFilter;
};

export type History = {
  commit: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => void;
  undo: () => OperationResult;
  redo: () => OperationResult;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export function createHistory(deps: HistoryDeps): History {
  const { getDoc, setDoc, notify, focusFilter } = deps;
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  function commit(
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ): void {
    undoStack.push({
      doc: cloneDoc(getDoc()),
      changes,
      ...(nodeId === undefined ? {} : { nodeId }),
      ...(focusNodeId === undefined ? {} : { focusNodeId }),
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    });
    setDoc(next);
    redoStack = [];
    notify();
  }

  function undo(): OperationResult {
    const previous = undoStack.pop();

    if (previous === undefined) {
      return { ok: false, code: "invalid_target", reason: "Undo stack is empty." };
    }

    const current = cloneDoc(getDoc());

    redoStack.push({
      doc: current,
      changes: previous.changes,
      ...(previous.nodeId === undefined ? {} : { nodeId: previous.nodeId }),
      ...(previous.focusNodeId === undefined ? {} : { focusNodeId: previous.focusNodeId }),
      ...(previous.focusNodeIds === undefined ? {} : { focusNodeIds: previous.focusNodeIds }),
    });
    setDoc(previous.doc);
    notify();
    return successResult(current, previous.doc, invertChanges(previous.changes), previous.nodeId, undefined, undefined, focusFilter);
  }

  function redo(): OperationResult {
    const next = redoStack.pop();

    if (next === undefined) {
      return { ok: false, code: "invalid_target", reason: "Redo stack is empty." };
    }

    const current = cloneDoc(getDoc());

    undoStack.push({
      doc: current,
      changes: next.changes,
      ...(next.nodeId === undefined ? {} : { nodeId: next.nodeId }),
      ...(next.focusNodeId === undefined ? {} : { focusNodeId: next.focusNodeId }),
      ...(next.focusNodeIds === undefined ? {} : { focusNodeIds: next.focusNodeIds }),
    });
    setDoc(next.doc);
    notify();
    return successResult(current, next.doc, next.changes, next.nodeId, next.focusNodeId, next.focusNodeIds, focusFilter);
  }

  return {
    commit,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
