import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  NodeId,
  OperationResult,
} from "zod-crud";

import {
  labEntity,
  makeEditor,
} from "./entities.js";
import {
  buildRows,
  canRenameNode,
  canUpdateNode,
  expandedContainerIds,
  expandedForSelection,
  insertionArrayId,
  nodeValueLabel,
  parseNodeValue,
  pathString,
  projectionColumns,
  validExpandedIds,
  valueInput,
} from "./projections.js";

type ViewMode = "treegrid" | "outline" | "cards";
type CommandLog = {
  command: string;
  result: OperationResult;
};

const viewModes: Array<{ id: ViewMode; label: string }> = [
  { id: "treegrid", label: "TreeGrid" },
  { id: "outline", label: "Outline" },
  { id: "cards", label: "Cards" },
];

export function App() {
  const editorRef = useRef(makeEditor());
  const [version, setVersion] = useState(0);
  const initialDoc = editorRef.current.snapshot();
  const [selectedId, setSelectedId] = useState<NodeId>(initialDoc.rootId);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(initialDoc));
  const [viewMode, setViewMode] = useState<ViewMode>("treegrid");
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    result: { ok: true },
  });
  const [keyDraft, setKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selectedId] === undefined ? doc.rootId : selectedId;
  const selectedNode = doc.nodes[safeSelectedId];
  const rows = useMemo(() => buildRows(doc, expandedIds), [doc, expandedIds]);
  const changedRows = useMemo(() => {
    const changes = lastCommand.result.ok ? lastCommand.result.changes ?? [] : [];
    return new Map(changes.map((change) => [change.nodeId, change.type]));
  }, [lastCommand.result]);
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;

  useEffect(() => {
    const node = doc.nodes[safeSelectedId];

    setKeyDraft(node?.key === null || node?.key === undefined ? "" : String(node.key));
    setValueDraft(valueInput(node));
  }, [doc, safeSelectedId]);

  function refresh() {
    setVersion((current) => current + 1);
  }

  function selectNode(nodeId: NodeId) {
    const nextDoc = editorRef.current.snapshot();

    if (nextDoc.nodes[nodeId] === undefined) {
      return;
    }

    setSelectedId(nodeId);
    setExpandedIds((current) => expandedForSelection(nextDoc, current, nodeId));
  }

  function toggleExpanded(nodeId: NodeId) {
    const node = doc.nodes[nodeId];

    if (node === undefined || node.children.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }

  function reset() {
    editorRef.current = makeEditor();

    const nextDoc = editorRef.current.snapshot();

    setSelectedId(nextDoc.rootId);
    setExpandedIds(expandedContainerIds(nextDoc));
    setLastCommand({ command: "reset", result: { ok: true } });
    refresh();
  }

  function runCommand(command: string, action: () => OperationResult) {
    const result = action();

    setLastCommand({ command, result });

    if (result.ok) {
      const nextDoc = editorRef.current.snapshot();
      const focusId = result.focusNodeId ?? result.nodeId ?? safeSelectedId;
      const nextSelectedId = nextDoc.nodes[focusId] === undefined ? nextDoc.rootId : focusId;

      setSelectedId(nextSelectedId);
      setExpandedIds((current) => expandedForSelection(nextDoc, validExpandedIds(nextDoc, current), nextSelectedId));
      refresh();
    }
  }

  function addChild() {
    runCommand("create", () => {
      const current = editorRef.current.snapshot();
      const arrayId = insertionArrayId(current, safeSelectedId, labEntity.childKeys);

      if (arrayId === null) {
        return { ok: false, reason: "Select an array or an object with a child array." };
      }

      const parent = current.nodes[arrayId];

      if (parent === undefined) {
        return { ok: false, reason: "Insertion target is missing." };
      }

      return editorRef.current.create(arrayId, parent.children.length, labEntity.createValue(parent, parent.children.length));
    });
  }

  function renameSelected() {
    runCommand("rename", () => editorRef.current.rename(safeSelectedId, keyDraft));
  }

  function updateSelected() {
    runCommand("update", () => {
      const node = editorRef.current.snapshot().nodes[safeSelectedId];

      if (node === undefined) {
        return { ok: false, reason: "Selected node is missing." };
      }

      if (!canUpdateNode(node)) {
        return { ok: false, reason: "Only primitive values can be updated here." };
      }

      try {
        return editorRef.current.update(safeSelectedId, parseNodeValue(node, valueDraft));
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  function copySelected() {
    try {
      editorRef.current.copy(safeSelectedId);
      setLastCommand({ command: "copy", result: { ok: true } });
    } catch (error) {
      setLastCommand({
        command: "copy",
        result: { ok: false, reason: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Nested UI projection lab</h1>
          <span>{labEntity.label}</span>
        </div>
        <div className="view-switcher" role="tablist" aria-label="Projection views">
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={viewMode === mode.id}
              className={viewMode === mode.id ? "is-active" : ""}
              onClick={() => setViewMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </header>

      <main className="app-shell">
        <CommandBar
          canDelete={safeSelectedId !== doc.rootId}
          canPaste={canPaste}
          onAdd={addChild}
          onCopy={copySelected}
          onCut={() => runCommand("cut", () => editorRef.current.cut(safeSelectedId))}
          onDelete={() => runCommand("delete", () => editorRef.current.delete(safeSelectedId))}
          onPaste={() => runCommand("paste", () => editorRef.current.paste(safeSelectedId))}
          onRedo={() => runCommand("redo", () => editorRef.current.redo())}
          onReset={reset}
          onUndo={() => runCommand("undo", () => editorRef.current.undo())}
        />

        <section className="workspace">
          <section className="panel projection-panel">
            <PanelTitle title={viewModes.find((mode) => mode.id === viewMode)?.label ?? "Projection"} detail={`${Object.keys(doc.nodes).length} nodes`} />
            {viewMode === "treegrid" ? (
              <TreeGridProjection
                changedRows={changedRows}
                doc={doc}
                expandedIds={expandedIds}
                rows={rows}
                selectedId={safeSelectedId}
                onSelect={selectNode}
                onToggle={toggleExpanded}
              />
            ) : null}
            {viewMode === "outline" ? (
              <OutlineProjection
                changedRows={changedRows}
                doc={doc}
                expandedIds={expandedIds}
                nodeId={doc.rootId}
                selectedId={safeSelectedId}
                onSelect={selectNode}
                onToggle={toggleExpanded}
              />
            ) : null}
            {viewMode === "cards" ? (
              <CardsProjection
                changedRows={changedRows}
                doc={doc}
                nodeId={doc.rootId}
                selectedId={safeSelectedId}
                onSelect={selectNode}
              />
            ) : null}
          </section>

          <aside className="panel inspector-panel">
            <PanelTitle title="Inspector" detail={selectedNode === undefined ? "missing" : pathString(doc, safeSelectedId)} />
            <Inspector
              doc={doc}
              keyDraft={keyDraft}
              lastCommand={lastCommand}
              selectedId={safeSelectedId}
              selectedNode={selectedNode}
              valueDraft={valueDraft}
              onKeyDraft={setKeyDraft}
              onRename={renameSelected}
              onUpdate={updateSelected}
              onValueDraft={setValueDraft}
            />
            <PanelTitle title="JSON" detail="current document" />
            <pre className="json-output">{JSON.stringify(jsonValue, null, 2)}</pre>
          </aside>
        </section>
      </main>
    </>
  );
}

function CommandBar({
  canDelete,
  canPaste,
  onAdd,
  onCopy,
  onCut,
  onDelete,
  onPaste,
  onRedo,
  onReset,
  onUndo,
}: {
  canDelete: boolean;
  canPaste: boolean;
  onAdd: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onReset: () => void;
  onUndo: () => void;
}) {
  return (
    <nav className="command-bar" aria-label="Document commands">
      <button type="button" onClick={onAdd}>Add child</button>
      <button type="button" onClick={onCopy}>Copy</button>
      <button type="button" disabled={!canDelete} onClick={onCut}>Cut</button>
      <button type="button" disabled={!canPaste} onClick={onPaste}>Paste</button>
      <button type="button" disabled={!canDelete} onClick={onDelete}>Delete</button>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onRedo}>Redo</button>
      <button type="button" onClick={onReset}>Reset</button>
    </nav>
  );
}

function TreeGridProjection({
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

function OutlineProjection({
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

function CardsProjection({
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

function Inspector({
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

function PanelTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function rowClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return [
    "grid-row",
    selectedId === nodeId ? "is-selected" : "",
    changeClass(changedRows.get(nodeId)),
  ].filter(Boolean).join(" ");
}

function itemClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return [
    "outline-item",
    selectedId === nodeId ? "is-selected" : "",
    changeClass(changedRows.get(nodeId)),
  ].filter(Boolean).join(" ");
}

function cardClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return [
    "node-card",
    selectedId === nodeId ? "is-selected" : "",
    changeClass(changedRows.get(nodeId)),
  ].filter(Boolean).join(" ");
}

function changeClass(change: JsonChange["type"] | undefined): string {
  return change === undefined ? "" : `change-${change}`;
}
