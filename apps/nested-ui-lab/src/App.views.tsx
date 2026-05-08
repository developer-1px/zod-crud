import type { JsonChange, JsonDoc, JsonNode, NodeId, OperationResult } from "zod-crud";

import {
  buildRows,
  canRenameNode,
  canUpdateNode,
  nodeValueLabel,
  projectionColumns,
} from "./projections.js";
import { cardClass, itemClass, rowClass } from "./App.chrome.js";

export type CommandLog = {
  command: string;
  result: OperationResult;
};

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

export function Inspector({
  doc,
  keyDraft,
  lastCommand,
  selectedId,
  selectedNode,
  valueDraft,
  onKeyDraft,
  onRename,
  onUpdate,
  onValueDraft,
}: {
  doc: JsonDoc;
  keyDraft: string;
  lastCommand: CommandLog;
  selectedId: NodeId;
  selectedNode: JsonNode | undefined;
  valueDraft: string;
  onKeyDraft: (value: string) => void;
  onRename: () => void;
  onUpdate: () => void;
  onValueDraft: (value: string) => void;
}) {
  return (
    <div className="inspector">
      <dl className="node-facts">
        <div><dt>ID</dt><dd>{selectedId}</dd></div>
        <div><dt>Type</dt><dd>{selectedNode?.type ?? "missing"}</dd></div>
        <div><dt>Children</dt><dd>{selectedNode?.children.length ?? 0}</dd></div>
      </dl>

      <label>
        <span>Key</span>
        <input value={keyDraft} disabled={!canRenameNode(doc, selectedId)} onChange={(event) => onKeyDraft(event.target.value)} />
      </label>
      <button type="button" disabled={!canRenameNode(doc, selectedId)} onClick={onRename}>Rename key</button>

      <label>
        <span>Value</span>
        <input value={valueDraft} disabled={!canUpdateNode(selectedNode)} onChange={(event) => onValueDraft(event.target.value)} />
      </label>
      <button type="button" disabled={!canUpdateNode(selectedNode)} onClick={onUpdate}>Update value</button>

      <div className={`result ${lastCommand.result.ok ? "is-ok" : "is-fail"}`}>
        <strong>{lastCommand.command}</strong>
        <span>{lastCommand.result.ok ? "ok" : lastCommand.result.reason}</span>
      </div>
      {lastCommand.result.ok && lastCommand.result.changes !== undefined ? (
        <ul className="changes">
          {lastCommand.result.changes.map((change) => (
            <li key={`${change.type}-${change.nodeId}`}>
              <span>{change.type}</span>
              <code>{change.nodeId}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
