import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type {
  GridColumn,
  GridRow,
} from "./grid-rows.js";
import { createTreeGridKeyDown } from "./createTreeGridKeyDown.js";
import { JsonTreeGridRow } from "./JsonTreeGridRow.js";
import type { InlineEditState, InlineStatus } from "./JsonTreeGridTypes.js";
import type { SelectionMode } from "./selection.js";
import type { EnumValueOption } from "./schema-options.js";

export type { InlineEditState, InlineStatus } from "./JsonTreeGridTypes.js";

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

  const onKeyDown = createTreeGridKeyDown({
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
  });

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

      {rows.map((row, rowIndex) => (
        <JsonTreeGridRow
          key={row.id}
          changedRows={changedRows}
          columns={columns}
          doc={doc}
          inlineEdit={inlineEdit}
          inlineStatus={inlineStatus}
          row={row}
          rowIndex={rowIndex}
          selectedId={selectedId}
          selectedIds={selectedIds}
          valueOptionsByNodeId={valueOptionsByNodeId}
          onCancelValueEdit={onCancelValueEdit}
          onCommitValueEdit={onCommitValueEdit}
          onExpand={onExpand}
          onInlineValueDraft={onInlineValueDraft}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
