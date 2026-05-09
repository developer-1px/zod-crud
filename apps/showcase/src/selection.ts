import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type { GridRow } from "./grid-rows.js";
import { visibleRangeIds } from "./selection-range.js";

export type SelectionMode = "single" | "range" | "toggle";

export type SelectionState = {
  anchorId: NodeId;
  activeId: NodeId;
  selectedIds: Set<NodeId>;
};

export function singleSelection(nodeId: NodeId): SelectionState {
  return {
    anchorId: nodeId,
    activeId: nodeId,
    selectedIds: new Set([nodeId]),
  };
}

export function focusSelection(doc: JsonDoc, nodeIds: NodeId[] | null, activeId: NodeId): SelectionState {
  if (nodeIds === null || nodeIds.length === 0) {
    return singleSelection(activeId);
  }

  const selectedIds = nodeIds.filter((nodeId) => doc.nodes[nodeId] !== undefined);

  if (selectedIds.length === 0) {
    return singleSelection(activeId);
  }

  const nextActiveId = selectedIds.includes(activeId)
    ? activeId
    : selectedIds[selectedIds.length - 1] ?? activeId;

  return {
    anchorId: selectedIds[0]!,
    activeId: nextActiveId,
    selectedIds: new Set(selectedIds),
  };
}

export function liveSelectedIds(doc: JsonDoc, selection: SelectionState, fallbackId: NodeId): Set<NodeId> {
  const ids = new Set<NodeId>();

  for (const nodeId of selection.selectedIds) {
    if (doc.nodes[nodeId] !== undefined) {
      ids.add(nodeId);
    }
  }

  if (ids.size === 0) {
    ids.add(doc.nodes[fallbackId] === undefined ? doc.rootId : fallbackId);
  }

  return ids;
}

export function normalizeSelection(doc: JsonDoc, selection: SelectionState, fallbackId: NodeId): SelectionState {
  const activeId = doc.nodes[selection.activeId] === undefined
    ? doc.nodes[fallbackId] === undefined ? doc.rootId : fallbackId
    : selection.activeId;
  const selectedIds = liveSelectedIds(doc, selection, activeId);
  const anchorId = doc.nodes[selection.anchorId] === undefined ? activeId : selection.anchorId;

  return {
    anchorId,
    activeId,
    selectedIds,
  };
}

export function applySelection(
  rows: GridRow[],
  current: SelectionState,
  nodeId: NodeId,
  mode: SelectionMode,
): SelectionState {
  if (mode === "range") {
    const rangeIds = visibleRangeIds(rows, current.anchorId, nodeId);

    return {
      anchorId: current.anchorId,
      activeId: nodeId,
      selectedIds: new Set(rangeIds.length === 0 ? [nodeId] : rangeIds),
    };
  }

  if (mode === "toggle") {
    const selectedIds = new Set(current.selectedIds);

    if (selectedIds.has(nodeId) && selectedIds.size > 1) {
      selectedIds.delete(nodeId);
    } else {
      selectedIds.add(nodeId);
    }

    return {
      anchorId: nodeId,
      activeId: nodeId,
      selectedIds,
    };
  }

  return singleSelection(nodeId);
}

export function eventSelectionMode(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectionMode {
  if (event.shiftKey) {
    return "range";
  }

  if (event.metaKey || event.ctrlKey) {
    return "toggle";
  }

  return "single";
}
