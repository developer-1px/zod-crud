import { useRef } from "react";
import type { NodeId } from "zod-crud";

import type {
  GridColumn,
  GridRow,
} from "./grid-rows.js";
import {
  eventSelectionMode,
  type SelectionMode,
} from "./selection.js";

export function JsonTreeGrid({
  columns,
  rows,
  activeColumn,
  changedRows,
  selectedId,
  selectedIds,
  onSelect,
  onMove,
  onToggle,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  activeColumn: number;
  changedRows: Map<NodeId, "insert" | "update" | "delete">;
  selectedId: NodeId;
  selectedIds: Set<NodeId>;
  onSelect: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onMove: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onToggle: (nodeId: NodeId) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const visibleIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const activeRowId = rows[visibleIndex]?.id ?? selectedId;
  const activeCellId = cellId(activeRowId, activeColumn);

  function move(deltaRow: number, deltaColumn: number, mode: SelectionMode = "single") {
    const nextRow = rows[clamp(visibleIndex + deltaRow, 0, rows.length - 1)];
    const nextColumn = clamp(activeColumn + deltaColumn, 0, columns.length - 1);

    if (nextRow !== undefined) {
      onMove(nextRow.id, nextColumn, mode);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const commandKey = event.metaKey || event.ctrlKey;

    if (commandKey && event.key === " ") {
      event.preventDefault();
      onSelect(activeRowId, activeColumn, "toggle");
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      onToggle(activeRowId);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(0, 1, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(0, -1, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onMove(activeRowId, 0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onMove(activeRowId, columns.length - 1);
    }
  }

  return (
    <div
      ref={gridRef}
      role="treegrid"
      aria-colcount={columns.length}
      aria-rowcount={rows.length + 1}
      aria-activedescendant={activeCellId}
      tabIndex={0}
      className="treegrid"
      onKeyDown={onKeyDown}
    >
      <div role="row" aria-rowindex={1} className="grid-row grid-head">
        {columns.map((column, columnIndex) => (
          <div key={column.id} role="columnheader" aria-colindex={columnIndex + 1}>
            {column.label}
          </div>
        ))}
      </div>

      {rows.map((row, rowIndex) => {
        const changeType = changedRows.get(row.id);

        return (
          <div
            key={row.id}
            role="row"
            aria-rowindex={rowIndex + 2}
            aria-level={row.depth + 1}
            aria-expanded={row.expandable ? row.expanded : undefined}
            aria-selected={selectedIds.has(row.id)}
            className={[
              "grid-row",
              selectedIds.has(row.id) ? "is-selected" : "",
              selectedId === row.id ? "is-active-row" : "",
              changeType === undefined ? "" : `change-${changeType}`,
            ].filter(Boolean).join(" ")}
          >
            {columns.map((column, columnIndex) => (
              <div
                key={column.id}
                id={cellId(row.id, columnIndex)}
                role="gridcell"
                aria-colindex={columnIndex + 1}
                aria-selected={selectedIds.has(row.id)}
                className={selectedId === row.id && activeColumn === columnIndex ? "grid-cell is-active" : "grid-cell"}
                onClick={(event) => {
                  onSelect(row.id, columnIndex, eventSelectionMode(event));
                  gridRef.current?.focus();
                }}
                onDoubleClick={() => {
                  if (columnIndex === 0) {
                    onToggle(row.id);
                  }
                }}
              >
                {column.id === "path" ? (
                  <span className="path-cell" style={{ paddingLeft: `${row.depth * 18}px` }}>
                    <span aria-hidden="true" className="twisty">
                      {row.expandable ? row.expanded ? "v" : ">" : ""}
                    </span>
                    <span>{row.path}</span>
                  </span>
                ) : column.id === "key" ? (
                  row.keyLabel
                ) : column.id === "type" ? (
                  row.type
                ) : (
                  row.value
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function cellId(nodeId: NodeId, columnIndex: number): string {
  return `grid-${nodeId}-${columnIndex}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
