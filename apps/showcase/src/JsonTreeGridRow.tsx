import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type {
  GridColumn,
  GridRow,
} from "./grid-rows.js";
import { JsonTreeGridCell } from "./JsonTreeGridCell.js";
import type {
  InlineEditState,
  InlineStatus,
} from "./JsonTreeGridTypes.js";
import { eventSelectionMode, type SelectionMode } from "./selection.js";
import type { EnumValueOption } from "./schema-options.js";

export function JsonTreeGridRow({
  changedRows,
  columns,
  doc,
  inlineEdit,
  inlineStatus,
  row,
  rowIndex,
  selectedId,
  selectedIds,
  valueOptionsByNodeId,
  onCancelValueEdit,
  onCommitValueEdit,
  onExpand,
  onInlineValueDraft,
  onSelect,
}: {
  changedRows: Map<NodeId, "insert" | "update" | "delete">;
  columns: GridColumn[];
  doc: JsonDoc;
  inlineEdit: InlineEditState | null;
  inlineStatus: InlineStatus | null;
  row: GridRow;
  rowIndex: number;
  selectedId: NodeId;
  selectedIds: Set<NodeId>;
  valueOptionsByNodeId: Map<NodeId, EnumValueOption[]>;
  onCancelValueEdit: () => void;
  onCommitValueEdit: () => void;
  onExpand: (nodeId: NodeId, open: boolean) => void;
  onInlineValueDraft: (value: string) => void;
  onSelect: (nodeId: NodeId, mode?: SelectionMode) => void;
}) {
  const node = doc.nodes[row.id];
  const changeType = changedRows.get(row.id);
  const isActive = selectedId === row.id;
  const valueOptions = valueOptionsByNodeId.get(row.id) ?? [];

  return (
    <div className="grid-row-block">
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
          <JsonTreeGridCell
            key={column.id}
            column={column}
            columnIndex={columnIndex}
            node={node}
            row={row}
            inlineEdit={inlineEdit}
            valueOptions={valueOptions}
            onCancelValueEdit={onCancelValueEdit}
            onCommitValueEdit={onCommitValueEdit}
            onExpand={onExpand}
            onInlineValueDraft={onInlineValueDraft}
          />
        ))}
      </div>
      {inlineStatus?.nodeId === row.id ? (
        <div className={`inline-status-row is-${inlineStatus.kind}`}>
          <span>{inlineStatus.message}</span>
        </div>
      ) : null}
    </div>
  );
}
