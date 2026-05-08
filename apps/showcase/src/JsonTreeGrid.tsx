import type {
  JsonDoc,
  JsonNode,
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
import { type EnumValueOption } from "./schema-options.js";
import { EnumValueBadge, InlineValueEditor } from "./InlineValueEditor.js";

export type InlineEditState = {
  nodeId: NodeId;
  draft: string;
  invalid: boolean;
  options: EnumValueOption[];
};

export type InlineStatus = {
  nodeId: NodeId;
  kind: "idle" | "valid" | "invalid";
  message: string;
};

export function JsonTreeGrid({
  doc,
  rows,
  columns,
  changedRows,
  valueOptionsByNodeId,
  selectedId,
  selectedIds,
  inlineEdit,
  inlineStatus,
  onSelect,
  onMove,
  onExpand,
  onStartValueEdit,
  onInlineValueDraft,
  onCommitValueEdit,
  onCancelValueEdit,
}: {
  doc: JsonDoc;
  columns: GridColumn[];
  rows: GridRow[];
  changedRows: Map<NodeId, "insert" | "update" | "delete">;
  valueOptionsByNodeId: Map<NodeId, EnumValueOption[]>;
  selectedId: NodeId;
  selectedIds: Set<NodeId>;
  inlineEdit: InlineEditState | null;
  inlineStatus: InlineStatus | null;
  onSelect: (nodeId: NodeId, mode?: SelectionMode) => void;
  onMove: (nodeId: NodeId, mode?: SelectionMode) => void;
  onExpand: (nodeId: NodeId, open: boolean) => void;
  onStartValueEdit: (nodeId: NodeId) => void;
  onInlineValueDraft: (value: string) => void;
  onCommitValueEdit: () => void;
  onCancelValueEdit: () => void;
}) {
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const visibleIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const activeRow = rows[visibleIndex];
  const activeRowId = activeRow?.id ?? selectedId;
  const activeNode = doc.nodes[activeRowId];

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

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
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
  }

  return (
    <div
      role="treegrid"
      aria-colcount={columns.length}
      aria-multiselectable={true}
      aria-rowcount={rows.length + 1}
      aria-label="JSON document tree"
      className="treegrid"
      tabIndex={0}
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
        const node = doc.nodes[row.id];
        const changeType = changedRows.get(row.id);
        const isActive = selectedId === row.id;
        const valueOptions = valueOptionsByNodeId.get(row.id) ?? [];

        return (
          <div key={row.id} className="grid-row-block">
            <div
              role="row"
              aria-expanded={row.expandable ? row.expanded : undefined}
              aria-level={row.depth + 1}
              aria-rowindex={rowIndex + 2}
              aria-selected={selectedIds.has(row.id)}
              className={[
                "grid-row",
                selectedIds.has(row.id) ? "is-selected" : "",
                isActive ? "is-active-row" : "",
                changeType === undefined ? "" : `change-${changeType}`,
              ].filter(Boolean).join(" ")}
              onClick={(event) => {
                (event.currentTarget.closest(".treegrid") as HTMLElement | null)?.focus();
                onSelect(row.id, eventSelectionMode(event));
              }}
              onDoubleClick={(event) => {
                event.preventDefault();

                if (row.expandable) {
                  onExpand(row.id, !row.expanded);
                }
              }}
            >
              {columns.map((column, columnIndex) => (
                <div
                  key={column.id}
                  role={columnIndex === 0 ? "rowheader" : "gridcell"}
                  aria-colindex={columnIndex + 1}
                  className="grid-cell"
                >
                  {column.id === "path" ? (
                    <span className="path-cell" style={{ paddingLeft: `${row.depth * 18}px` }}>
                      <button
                        type="button"
                        className="twisty-button"
                        aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.path}`}
                        disabled={!row.expandable}
                        onClick={(event) => {
                          event.stopPropagation();
                          onExpand(row.id, !row.expanded);
                        }}
                      >
                        {row.expandable ? row.expanded ? "v" : ">" : ""}
                      </button>
                      <span>{row.path}</span>
                    </span>
                  ) : column.id === "key" ? (
                    row.keyLabel
                  ) : column.id === "type" ? (
                    row.type
                  ) : inlineEdit?.nodeId === row.id && node !== undefined ? (
                    <InlineValueEditor
                      node={node}
                      path={row.path}
                      state={inlineEdit}
                      onDraft={onInlineValueDraft}
                      onCommit={onCommitValueEdit}
                      onCancel={onCancelValueEdit}
                    />
                  ) : valueOptions.length > 0 && node?.value !== undefined ? (
                    <EnumValueBadge value={node.value} />
                  ) : (
                    row.value
                  )}
                </div>
              ))}
            </div>
            {inlineStatus?.nodeId === row.id ? (
              <div className={`inline-status-row is-${inlineStatus.kind}`}>
                <span>{inlineStatus.message}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
