import type { KeyboardEvent } from "react";
import type {
  JsonDoc,
  JsonNode,
  NodeId,
} from "zod-crud";

import type { GridRow } from "./grid-rows.js";
import type { SelectionMode } from "./selection.js";

export function createTreeGridKeyDown({
  activeNode,
  activeRow,
  activeRowId,
  doc,
  rows,
  visibleIndex,
  onExpand,
  onMove,
  onSelect,
  onStartValueEdit,
}: {
  activeNode: JsonNode | undefined;
  activeRow: GridRow | undefined;
  activeRowId: NodeId;
  doc: JsonDoc;
  rows: GridRow[];
  visibleIndex: number;
  onExpand: (nodeId: NodeId, open: boolean) => void;
  onMove: (nodeId: NodeId, mode?: SelectionMode) => void;
  onSelect: (nodeId: NodeId, mode?: SelectionMode) => void;
  onStartValueEdit: (nodeId: NodeId) => void;
}) {
  function move(delta: number, mode: SelectionMode = "single") {
    const nextRow = rows[clamp(visibleIndex + delta, 0, rows.length - 1)];

    if (nextRow !== undefined) {
      onMove(nextRow.id, mode);
    }
  }

  function moveToParent() {
    const parentId = activeNode?.parentId;

    if (parentId !== null && parentId !== undefined && doc.nodes[parentId] !== undefined) {
      onMove(parentId);
    }
  }

  function moveToFirstChild() {
    const firstChildId = activeNode?.children[0];

    if (firstChildId !== undefined && doc.nodes[firstChildId] !== undefined) {
      onMove(firstChildId);
    }
  }

  return function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const commandKey = event.metaKey || event.ctrlKey;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();

      if (activeRow?.expandable === true && activeRow.expanded) {
        onExpand(activeRow.id, false);
      } else {
        moveToParent();
      }

      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();

      if (activeRow?.expandable === true && !activeRow.expanded) {
        onExpand(activeRow.id, true);
      } else {
        moveToFirstChild();
      }

      return;
    }

    if (commandKey && event.key === " ") {
      event.preventDefault();
      onSelect(activeRowId, "toggle");
      return;
    }

    if (!commandKey && event.key === "Enter") {
      event.preventDefault();
      onStartValueEdit(activeRowId);
    }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
