import type { JsonChange, JsonDoc, NodeId } from "zod-crud";

import { rowClass } from "./App.chrome.js";
import {
  buildRows,
  projectionColumns,
} from "./projections.js";

export function TreeGridProjection({
  changedRows,
  rows,
  selectedId,
  onSelect,
  onToggle,
}: {
  changedRows: Map<NodeId, JsonChange["type"]>;
  doc: JsonDoc;
  expandedIds: Set<NodeId>;
  rows: ReturnType<typeof buildRows>;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
  onToggle: (nodeId: NodeId) => void;
}) {
  return (
    <div role="treegrid" aria-label="Document treegrid" aria-colcount={projectionColumns.length} aria-rowcount={rows.length + 1} className="treegrid">
      <div role="row" aria-rowindex={1} className="grid-row grid-head">
        {projectionColumns.map((column, index) => (
          <div key={column.id} role="columnheader" aria-colindex={index + 1}>
            {column.label}
          </div>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <button
          key={row.id}
          type="button"
          role="row"
          aria-expanded={row.expandable ? row.expanded : undefined}
          aria-level={row.depth + 1}
          aria-rowindex={rowIndex + 2}
          aria-selected={selectedId === row.id}
          className={rowClass(row.id, selectedId, changedRows)}
          onClick={() => onSelect(row.id)}
          onDoubleClick={() => onToggle(row.id)}
        >
          <span role="rowheader" aria-colindex={1} className="grid-cell path-cell" style={{ paddingLeft: `${row.depth * 18 + 9}px` }}>
            <span aria-hidden="true" className="twisty">{row.expandable ? row.expanded ? "v" : ">" : ""}</span>
            {row.path}
          </span>
          <span role="gridcell" aria-colindex={2} className="grid-cell">{row.keyLabel}</span>
          <span role="gridcell" aria-colindex={3} className="grid-cell">{row.type}</span>
          <span role="gridcell" aria-colindex={4} className="grid-cell">{row.value}</span>
        </button>
      ))}
    </div>
  );
}
