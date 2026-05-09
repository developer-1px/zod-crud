import type { JsonChange, JsonDoc, NodeId } from "zod-crud";

import { itemClass } from "./App.chrome.js";
import { nodeValueLabel } from "./projections.js";

export function OutlineProjection({
  changedRows,
  doc,
  expandedIds,
  nodeId,
  selectedId,
  onSelect,
  onToggle,
}: {
  changedRows: Map<NodeId, JsonChange["type"]>;
  doc: JsonDoc;
  expandedIds: Set<NodeId>;
  nodeId: NodeId;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
  onToggle: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  const expanded = expandedIds.has(nodeId);

  return (
    <ul className={node.parentId === null ? "outline-root" : "outline-list"}>
      <li>
        <div className={itemClass(nodeId, selectedId, changedRows)}>
          <button type="button" className="icon-button" onClick={() => onToggle(nodeId)}>
            {node.children.length > 0 ? expanded ? "v" : ">" : ""}
          </button>
          <button type="button" className="node-button" onClick={() => onSelect(nodeId)}>
            <span>{node.key === null ? "root" : String(node.key)}</span>
            <small>{node.type} {nodeValueLabel(node)}</small>
          </button>
        </div>
        {expanded ? node.children.map((childId) => (
          <OutlineProjection
            key={childId}
            changedRows={changedRows}
            doc={doc}
            expandedIds={expandedIds}
            nodeId={childId}
            selectedId={selectedId}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        )) : null}
      </li>
    </ul>
  );
}
