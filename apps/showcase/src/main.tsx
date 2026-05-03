import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import {
  createJsonCrud,
  type JsonDoc,
  type JsonNode,
  type JsonValue,
  type NodeId,
  type OperationResult,
} from "zod-crud";

import "./style.css";

declare global {
  var zodCrudShowcaseRoot: Root | undefined;
}

type CommandNode = {
  title: string;
  status: "draft" | "active" | "done";
  children: CommandNode[];
};

type CommandId = "copy" | "cut" | "paste" | "delete" | "undo" | "redo";

type CommandLog = {
  command: string;
  target: string;
  result: OperationResult;
};

type GridColumn = {
  id: "path" | "key" | "type" | "value";
  label: string;
};

type GridRow = {
  id: NodeId;
  depth: number;
  keyLabel: string;
  path: string;
  type: JsonNode["type"];
  value: string;
  childCount: number;
  expandable: boolean;
  expanded: boolean;
};

const columns: GridColumn[] = [
  { id: "path", label: "Path" },
  { id: "key", label: "Key" },
  { id: "type", label: "Type" },
  { id: "value", label: "Value" },
];

const CommandNodeSchema: z.ZodType<CommandNode> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    status: z.union([z.literal("draft"), z.literal("active"), z.literal("done")]),
    children: z.array(CommandNodeSchema),
  }),
);

const initialDocument: CommandNode = {
  title: "Command document",
  status: "active",
  children: [
    {
      title: "Copy source",
      status: "draft",
      children: [
        { title: "Nested child", status: "done", children: [] },
      ],
    },
    { title: "Paste target", status: "active", children: [] },
    { title: "Delete candidate", status: "draft", children: [] },
  ],
};

const commands: Array<{ id: CommandId; keys: string; operation: string }> = [
  { id: "copy", keys: "Cmd+C", operation: "copy(row)" },
  { id: "cut", keys: "Cmd+X", operation: "cut(row)" },
  { id: "paste", keys: "Cmd+V", operation: "paste(row)" },
  { id: "delete", keys: "Delete", operation: "delete(row)" },
  { id: "undo", keys: "Cmd+Z", operation: "undo()" },
  { id: "redo", keys: "Cmd+Shift+Z", operation: "redo()" },
];

function makeEditor() {
  return createJsonCrud(CommandNodeSchema, initialDocument, { childKeys: ["children"] });
}

function App() {
  const editorRef = useRef(makeEditor());
  const nextItemRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<NodeId>(() => editorRef.current.snapshot().rootId);
  const [activeColumn, setActiveColumn] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(editorRef.current.snapshot()));
  const [clipboardValue, setClipboardValue] = useState<JsonValue | null>(null);
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    target: "/",
    result: { ok: true },
  });

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selectedId] === undefined ? doc.rootId : selectedId;
  const selectedNode = doc.nodes[safeSelectedId];
  const rows = useMemo(() => buildGridRows(doc, expandedIds), [doc, expandedIds]);
  const selectedRow = rows.find((row) => row.id === safeSelectedId) ?? rows[0] ?? null;
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const toggleExpanded = useCallback((nodeId: NodeId) => {
    const node = editorRef.current.snapshot().nodes[nodeId];

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
  }, []);

  const selectGridCell = useCallback((nodeId: NodeId, columnIndex: number) => {
    setSelectedId(nodeId);
    setActiveColumn(clamp(columnIndex, 0, columns.length - 1));
  }, []);

  const runCommand = useCallback((command: CommandId) => {
    const editor = editorRef.current;
    const before = editor.snapshot();
    const targetId = before.nodes[selectedId] === undefined ? before.rootId : selectedId;
    const targetLabel = nodeLabel(before, targetId);
    let result: OperationResult = { ok: true };
    let nextSelection = targetId;

    try {
      if (command === "copy") {
        setClipboardValue(editor.copy(targetId));
      }

      if (command === "cut") {
        const copied = editor.read(targetId);

        result = editor.cut(targetId);

        if (result.ok) {
          setClipboardValue(copied);
          nextSelection = recoverSelection(before, editor.snapshot(), targetId);
        }
      }

      if (command === "paste") {
        result = editor.paste(targetId);
      }

      if (command === "delete") {
        result = editor.delete(targetId);

        if (result.ok) {
          nextSelection = recoverSelection(before, editor.snapshot(), targetId);
        }
      }

      if (command === "undo") {
        result = editor.undo()
          ? { ok: true }
          : { ok: false, reason: "Undo stack is empty." };
        nextSelection = keepSelectionOrRoot(editor.snapshot(), targetId);
      }

      if (command === "redo") {
        result = editor.redo()
          ? { ok: true }
          : { ok: false, reason: "Redo stack is empty." };
        nextSelection = keepSelectionOrRoot(editor.snapshot(), targetId);
      }
    } catch (error) {
      result = failure(error);
    }

    const after = editor.snapshot();

    setExpandedIds((current) => validExpandedIds(after, current));
    setSelectedId(after.nodes[nextSelection] === undefined ? after.rootId : nextSelection);
    setLastCommand({ command, target: targetLabel, result });
    refresh();
  }, [refresh, selectedId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (commandKey && !event.altKey) {
        const command =
          key === "c" ? "copy" :
          key === "x" ? "cut" :
          key === "v" ? "paste" :
          key === "z" && event.shiftKey ? "redo" :
          key === "z" ? "undo" :
          null;

        if (command !== null) {
          event.preventDefault();
          runCommand(command);
        }
      }

      if (!commandKey && !isEditableTarget(event.target) && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        runCommand("delete");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runCommand]);

  function addChild() {
    const current = editorRef.current.snapshot();
    const targetId = current.nodes[safeSelectedId] === undefined ? current.rootId : safeSelectedId;
    const childrenId = insertionArrayId(current, targetId);

    if (childrenId === null) {
      setLastCommand({
        command: "create",
        target: nodeLabel(current, targetId),
        result: { ok: false, reason: "Select an object with children or a children array." },
      });
      return;
    }

    const parent = current.nodes[childrenId];
    const index = parent?.children.length ?? 0;
    const title = `New child ${nextItemRef.current}`;
    const result = editorRef.current.create(childrenId, index, {
      title,
      status: "draft",
      children: [],
    });

    nextItemRef.current += 1;

    const after = editorRef.current.snapshot();
    const createdId = nodeIdByTitle(after, title);

    setExpandedIds((currentExpanded) => {
      const next = validExpandedIds(after, currentExpanded);
      const parentId = after.nodes[childrenId]?.parentId;

      next.add(childrenId);

      if (parentId !== undefined && parentId !== null) {
        next.add(parentId);
      }

      return next;
    });

    if (createdId !== null) {
      setSelectedId(createdId);
      setActiveColumn(0);
    }

    setLastCommand({
      command: "create",
      target: nodeLabel(current, targetId),
      result,
    });
    refresh();
  }

  function reset() {
    editorRef.current = makeEditor();
    nextItemRef.current = 1;
    setClipboardValue(null);

    const nextDoc = editorRef.current.snapshot();

    setSelectedId(nextDoc.rootId);
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setLastCommand({
      command: "reset",
      target: "/",
      result: { ok: true },
    });
    refresh();
  }

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">zod-crud</p>
          <h1>JSON treegrid editor</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={addChild}>Add child</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>

      <main className="app-shell">
        <section className="command-strip" aria-label="Keyboard command results">
          {commands.map((command) => (
            <button
              key={command.id}
              type="button"
              className={lastCommand.command === command.id ? "command-card is-active" : "command-card"}
              onClick={() => runCommand(command.id)}
              disabled={command.id === "paste" && !canPaste}
            >
              <kbd>{command.keys}</kbd>
              <span>{command.operation}</span>
            </button>
          ))}
        </section>

        <section className="workspace">
          <section className="panel editor-panel">
            <PanelTitle
              title="JsonDoc treegrid"
              detail={selectedRow === null ? "/" : `${selectedRow.path} - ${columns[activeColumn]?.label ?? ""}`}
            />
            <JsonTreeGrid
              columns={columns}
              rows={rows}
              activeColumn={activeColumn}
              selectedId={safeSelectedId}
              onSelect={selectGridCell}
              onMove={(rowId, columnIndex) => selectGridCell(rowId, columnIndex)}
              onToggle={toggleExpanded}
            />
          </section>

          <aside className="panel detail-panel">
            <PanelTitle title="Selected node" detail={safeSelectedId} />
            <dl className="result-list">
              <div>
                <dt>Path</dt>
                <dd>{selectedNode === undefined ? "/" : pathString(doc, safeSelectedId)}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedNode?.type ?? "none"}</dd>
              </div>
              <div>
                <dt>Children</dt>
                <dd>{selectedNode?.children.length ?? 0}</dd>
              </div>
            </dl>

            <PanelTitle title="Command state" detail={lastCommand.command} />
            <dl className="result-list">
              <div>
                <dt>Target</dt>
                <dd>{lastCommand.target}</dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd className={lastCommand.result.ok ? "ok" : "error"}>
                  {lastCommand.result.ok ? "ok" : lastCommand.result.reason}
                </dd>
              </div>
              <div>
                <dt>Clipboard</dt>
                <dd>{clipboardValue === null ? "empty" : valueLabel(clipboardValue)}</dd>
              </div>
            </dl>

            <PanelTitle title="JSON output" />
            <pre className="json-output">{JSON.stringify(jsonValue, null, 2)}</pre>
          </aside>
        </section>
      </main>
    </>
  );
}

function PanelTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {detail === undefined ? null : <span>{detail}</span>}
    </div>
  );
}

function JsonTreeGrid({
  columns,
  rows,
  activeColumn,
  selectedId,
  onSelect,
  onMove,
  onToggle,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  activeColumn: number;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId, columnIndex: number) => void;
  onMove: (nodeId: NodeId, columnIndex: number) => void;
  onToggle: (nodeId: NodeId) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const visibleIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const activeRowId = rows[visibleIndex]?.id ?? selectedId;
  const activeCellId = cellId(activeRowId, activeColumn);

  function move(deltaRow: number, deltaColumn: number) {
    const nextRow = rows[clamp(visibleIndex + deltaRow, 0, rows.length - 1)];
    const nextColumn = clamp(activeColumn + deltaColumn, 0, columns.length - 1);

    if (nextRow !== undefined) {
      onMove(nextRow.id, nextColumn);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === " ") {
      event.preventDefault();
      onToggle(activeRowId);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1, 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1, 0);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(0, 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(0, -1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onMove(activeRowId, 0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onMove(activeRowId, columns.length - 1);
    }
  }

  return (
    <div
      ref={gridRef}
      role="treegrid"
      aria-colcount={columns.length}
      aria-rowcount={rows.length + 1}
      aria-activedescendant={activeCellId}
      tabIndex={0}
      className="treegrid"
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
        <div
          key={row.id}
          role="row"
          aria-rowindex={rowIndex + 2}
          aria-level={row.depth + 1}
          aria-expanded={row.expandable ? row.expanded : undefined}
          aria-selected={selectedId === row.id}
          className={selectedId === row.id ? "grid-row is-selected" : "grid-row"}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={column.id}
              id={cellId(row.id, columnIndex)}
              role="gridcell"
              aria-colindex={columnIndex + 1}
              aria-selected={selectedId === row.id && activeColumn === columnIndex}
              className={selectedId === row.id && activeColumn === columnIndex ? "grid-cell is-active" : "grid-cell"}
              onClick={() => {
                onSelect(row.id, columnIndex);
                gridRef.current?.focus();
              }}
              onDoubleClick={() => {
                if (columnIndex === 0) {
                  onToggle(row.id);
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
              ) : (
                row.value
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function buildGridRows(doc: JsonDoc, expandedIds: Set<NodeId>): GridRow[] {
  const rows: GridRow[] = [];

  function visit(nodeId: NodeId, depth: number) {
    const node = doc.nodes[nodeId];

    if (node === undefined) {
      return;
    }

    const expandable = node.children.length > 0;
    const expanded = expandedIds.has(node.id);

    rows.push({
      id: node.id,
      depth,
      keyLabel: node.key === null ? "root" : String(node.key),
      path: pathString(doc, node.id),
      type: node.type,
      value: nodeValueLabel(node),
      childCount: node.children.length,
      expandable,
      expanded,
    });

    if (expandable && expanded) {
      for (const childId of node.children) {
        visit(childId, depth + 1);
      }
    }
  }

  visit(doc.rootId, 0);
  return rows;
}

function expandedContainerIds(doc: JsonDoc): Set<NodeId> {
  const ids = new Set<NodeId>();

  for (const node of Object.values(doc.nodes)) {
    if (node.children.length > 0) {
      ids.add(node.id);
    }
  }

  return ids;
}

function validExpandedIds(doc: JsonDoc, ids: Set<NodeId>): Set<NodeId> {
  const next = new Set<NodeId>();

  for (const id of ids) {
    const node = doc.nodes[id];

    if (node !== undefined && node.children.length > 0) {
      next.add(id);
    }
  }

  return next;
}

function insertionArrayId(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];

  if (node?.type === "array") {
    return node.id;
  }

  if (node?.type === "object") {
    const children = childByKey(doc, node.id, "children");

    if (children?.type === "array") {
      return children.id;
    }
  }

  const nearest = nearestDomainObject(doc, nodeId);

  if (nearest !== null) {
    const children = childByKey(doc, nearest, "children");

    if (children?.type === "array") {
      return children.id;
    }
  }

  return null;
}

function nearestDomainObject(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  let current = doc.nodes[nodeId];

  while (current !== undefined) {
    if (isDomainObject(doc, current)) {
      return current.id;
    }

    current = current.parentId === null ? undefined : doc.nodes[current.parentId];
  }

  return null;
}

function isDomainObject(doc: JsonDoc, node: JsonNode | undefined): boolean {
  return node?.type === "object" &&
    childByKey(doc, node.id, "title")?.type === "string" &&
    childByKey(doc, node.id, "status")?.type === "string" &&
    childByKey(doc, node.id, "children")?.type === "array";
}

function childByKey(doc: JsonDoc, nodeId: NodeId, key: string | number): JsonNode | undefined {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return undefined;
  }

  const childId = node.children.find((id) => doc.nodes[id]?.key === key);
  return childId === undefined ? undefined : doc.nodes[childId];
}

function recoverSelection(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId {
  const oldNode = before.nodes[removedId];

  if (oldNode === undefined) {
    return after.rootId;
  }

  const siblings = oldNode.parentId === null ? [] : before.nodes[oldNode.parentId]?.children ?? [];
  const oldIndex = siblings.indexOf(removedId);
  const candidates = [
    siblings[oldIndex + 1],
    siblings[oldIndex - 1],
    oldNode.parentId,
  ].filter((id): id is NodeId => id !== undefined);

  for (const candidate of candidates) {
    if (after.nodes[candidate] !== undefined) {
      return candidate;
    }

    const parent = nearestExistingParent(before, after, candidate);

    if (parent !== null) {
      return parent;
    }
  }

  return after.rootId;
}

function nearestExistingParent(before: JsonDoc, after: JsonDoc, nodeId: NodeId): NodeId | null {
  let current = before.nodes[nodeId];

  while (current !== undefined) {
    if (after.nodes[current.id] !== undefined) {
      return current.id;
    }

    current = current.parentId === null ? undefined : before.nodes[current.parentId];
  }

  return null;
}

function keepSelectionOrRoot(doc: JsonDoc, nodeId: NodeId): NodeId {
  return doc.nodes[nodeId] === undefined ? doc.rootId : nodeId;
}

function pathString(doc: JsonDoc, nodeId: NodeId): string {
  const segments: Array<string | number> = [];
  let current = doc.nodes[nodeId];

  while (current !== undefined && current.parentId !== null) {
    if (current.key !== null) {
      segments.unshift(current.key);
    }

    current = doc.nodes[current.parentId];
  }

  return `/${segments.map(String).join("/")}`;
}

function nodeLabel(doc: JsonDoc, nodeId: NodeId): string {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return nodeId;
  }

  return `${pathString(doc, nodeId)} (${node.type})`;
}

function nodeValueLabel(node: JsonNode): string {
  if (node.type === "object") {
    return `{${node.children.length}}`;
  }

  if (node.type === "array") {
    return `[${node.children.length}]`;
  }

  return node.value === undefined ? "" : valueLabel(node.value);
}

function valueLabel(value: JsonValue): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function nodeIdByTitle(doc: JsonDoc, title: string): NodeId | null {
  for (const node of Object.values(doc.nodes)) {
    if (node.type === "object" && childByKey(doc, node.id, "title")?.value === title) {
      return node.id;
    }
  }

  return null;
}

function cellId(nodeId: NodeId, columnIndex: number): string {
  return `grid-${nodeId}-${columnIndex}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing root element.");
}

globalThis.zodCrudShowcaseRoot ??= createRoot(rootElement);
globalThis.zodCrudShowcaseRoot.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
