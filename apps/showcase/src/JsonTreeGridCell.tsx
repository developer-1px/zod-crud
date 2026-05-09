import type {
  JsonDoc,
  NodeId,
} from "zod-crud";

import type {
  GridColumn,
  GridRow,
} from "./grid-rows.js";
import { EnumValueBadge, InlineValueEditor } from "./InlineValueEditor.js";
import type { InlineEditState } from "./JsonTreeGridTypes.js";
import type { EnumValueOption } from "./schema-options.js";

export function JsonTreeGridCell({
  column,
  columnIndex,
  inlineEdit,
  node,
  row,
  valueOptions,
  onCancelValueEdit,
  onCommitValueEdit,
  onExpand,
  onInlineValueDraft,
}: {
  column: GridColumn;
  columnIndex: number;
  inlineEdit: InlineEditState | null;
  node: JsonDoc["nodes"][NodeId] | undefined;
  row: GridRow;
  valueOptions: EnumValueOption[];
  onCancelValueEdit: () => void;
  onCommitValueEdit: () => void;
  onExpand: (nodeId: NodeId, open: boolean) => void;
  onInlineValueDraft: (value: string) => void;
}) {
  return (
    <div role={columnIndex === 0 ? "rowheader" : "gridcell"} aria-colindex={columnIndex + 1} className="grid-cell">
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
  );
}
