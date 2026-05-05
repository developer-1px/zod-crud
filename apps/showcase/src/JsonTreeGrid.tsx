import {
  useMemo,
  useRef,
} from "react";
import { useTreeGridPattern } from "@p/headless/patterns";
import {
  type NormalizedData,
  type UiEvent,
} from "@p/headless";
import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type {
  GridColumn,
  GridRow,
} from "./grid-rows.js";
import {
  eventSelectionMode,
  type SelectionMode,
} from "./selection.js";

export function JsonTreeGrid({
  doc,
  expandedIds,
  columns,
  rows,
  activeColumn,
  changedRows,
  selectedId,
  selectedIds,
  inlineEdit,
  onSelect,
  onMove,
  onExpand,
  onStartValueEdit,
  onInlineValueDraft,
  onCommitValueEdit,
  onCancelValueEdit,
}: {
  doc: JsonDoc;
  expandedIds: Set<NodeId>;
  columns: GridColumn[];
  rows: GridRow[];
  activeColumn: number;
  changedRows: Map<NodeId, "insert" | "update" | "delete">;
  selectedId: NodeId;
  selectedIds: Set<NodeId>;
  inlineEdit: {
    nodeId: NodeId;
    draft: string;
    invalid: boolean;
  } | null;
  onSelect: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onMove: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onExpand: (nodeId: NodeId, open: boolean) => void;
  onStartValueEdit: (nodeId: NodeId) => void;
  onInlineValueDraft: (value: string) => void;
  onCommitValueEdit: () => void;
  onCancelValueEdit: () => void;
}) {
  const pointerTargetRef = useRef<{ columnIndex: number; mode: SelectionMode } | null>(null);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const headlessData = useMemo<NormalizedData>(() => {
    const entities: NormalizedData["entities"] = {};
    const relationships: NormalizedData["relationships"] = {};

    for (const node of Object.values(doc.nodes)) {
      entities[node.id] = {
        label: rowById.get(node.id)?.path ?? String(node.key ?? node.id),
        selected: selectedIds.has(node.id),
      };
      relationships[node.id] = [...node.children];
    }

    return {
      entities,
      relationships,
      meta: {
        root: [doc.rootId],
        expanded: [...expandedIds],
        focus: selectedId,
      },
    };
  }, [doc, expandedIds, rowById, selectedId, selectedIds]);
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const visibleIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const activeRowId = rows[visibleIndex]?.id ?? selectedId;
  const treegrid = useTreeGridPattern(headlessData, onTreeGridEvent, {
    colCount: columns.length,
    label: "JSON document treegrid",
    selectionFollowsFocus: false,
  });

  function move(deltaRow: number, deltaColumn: number, mode: SelectionMode = "single") {
    const nextRow = rows[clamp(visibleIndex + deltaRow, 0, rows.length - 1)];
    const nextColumn = clamp(activeColumn + deltaColumn, 0, columns.length - 1);

    if (nextRow !== undefined) {
      onMove(nextRow.id, nextColumn, mode);
    }
  }

  function onTreeGridEvent(event: UiEvent) {
    if (event.type === "navigate") {
      pointerTargetRef.current = null;
      onMove(event.id, activeColumn);
      return;
    }

    if (event.type === "expand") {
      pointerTargetRef.current = null;
      onExpand(event.id, event.open);
      return;
    }

    if (event.type === "activate") {
      const pointerTarget = pointerTargetRef.current;
      const node = doc.nodes[event.id];

      pointerTargetRef.current = null;

      if (pointerTarget === null && node !== undefined && node.children.length === 0) {
        onStartValueEdit(event.id);
        return;
      }

      onSelect(event.id, pointerTarget?.columnIndex ?? activeColumn, pointerTarget?.mode ?? "single");
    }
  }

  function onKeyDownCapture(event: React.KeyboardEvent<HTMLDivElement>) {
    const commandKey = event.metaKey || event.ctrlKey;

    if (!commandKey && event.key === "Enter") {
      const node = doc.nodes[activeRowId];

      if (node !== undefined && node.children.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        pointerTargetRef.current = null;
        onStartValueEdit(activeRowId);
        return;
      }
    }

    if (commandKey && event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      pointerTargetRef.current = null;
      onSelect(activeRowId, activeColumn, "toggle");
      return;
    }

    if (event.shiftKey && event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      pointerTargetRef.current = null;
      move(1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.shiftKey && event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      pointerTargetRef.current = null;
      move(-1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    pointerTargetRef.current = null;
  }

  return (
    <div
      {...treegrid.treegridProps}
      aria-multiselectable={true}
      className="treegrid"
      onKeyDownCapture={onKeyDownCapture}
      onMouseDownCapture={(event) => event.currentTarget.focus()}
    >
      <div {...treegrid.headerRowProps} className="grid-row grid-head">
        {columns.map((column, columnIndex) => (
          <div key={column.id} {...treegrid.columnheaderProps(columnIndex)}>
            {column.label}
          </div>
        ))}
      </div>

      {treegrid.items.map((item, rowIndex) => {
        const row = rowById.get(item.id);

        if (row === undefined) {
          return null;
        }

        const changeType = changedRows.get(row.id);
        const node = doc.nodes[row.id];

        return (
          <div
            {...treegrid.rowProps(row.id)}
            key={row.id}
            aria-rowindex={rowIndex + 2}
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
                {...(columnIndex === 0
                  ? treegrid.rowheaderProps(row.id)
                  : treegrid.gridcellProps(row.id, columnIndex))}
                id={cellId(row.id, columnIndex)}
                aria-selected={selectedIds.has(row.id)}
                className={selectedId === row.id && activeColumn === columnIndex ? "grid-cell is-active" : "grid-cell"}
                onMouseDown={(event) => {
                  (event.currentTarget.closest(".treegrid") as HTMLElement | null)?.focus();
                  pointerTargetRef.current = {
                    columnIndex,
                    mode: eventSelectionMode(event),
                  };
                }}
                onDoubleClick={() => {
                  if (columnIndex === 0) {
                    onExpand(row.id, !row.expanded);
                    return;
                  }

                  if (column.id === "value" && node !== undefined && node.children.length === 0) {
                    onStartValueEdit(row.id);
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
                ) : inlineEdit?.nodeId === row.id ? (
                  <form
                    className="inline-value-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onCommitValueEdit();
                    }}
                  >
                    <input
                      aria-label={`Edit value for ${row.path}`}
                      autoFocus
                      className={inlineEdit.invalid ? "inline-value-input is-invalid" : "inline-value-input"}
                      value={inlineEdit.draft}
                      onChange={(event) => onInlineValueDraft(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => {
                        event.stopPropagation();

                        if (event.key === "Enter") {
                          event.preventDefault();
                          onCommitValueEdit();
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelValueEdit();
                        }
                      }}
                      onKeyUp={(event) => {
                        event.stopPropagation();

                        if (event.key === "Enter") {
                          event.preventDefault();
                          onCommitValueEdit();
                        }
                      }}
                    />
                  </form>
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
