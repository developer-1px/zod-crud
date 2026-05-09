import type { JsonChange, JsonDoc, NodeId } from "zod-crud";

import { cardClass } from "./App.chrome.js";
import { nodeValueLabel } from "./projections.js";

export function CardsProjection({
  changedRows,
  doc,
  nodeId,
  selectedId,
  onSelect,
}: {
  changedRows: Map<NodeId, JsonChange["type"]>;
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  return (
    <article className={cardClass(nodeId, selectedId, changedRows)} onClick={(event) => {
      event.stopPropagation();
      onSelect(nodeId);
    }}>
      <header>
        <span>{node.key === null ? "root" : String(node.key)}</span>
        <small>{node.type}</small>
      </header>
      {node.children.length === 0 ? (
        <p>{nodeValueLabel(node)}</p>
      ) : (
        <div className="card-children">
          {node.children.map((childId) => (
            <CardsProjection
              key={childId}
              changedRows={changedRows}
              doc={doc}
              nodeId={childId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </article>
  );
}
