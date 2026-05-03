import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import {
  createJsonCrud,
  type JsonChange,
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

type CustomerDirectory = {
  team: string;
  contacts: Array<{
    name: string;
    email: string;
    tags: string[];
  }>;
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

type SelectionMode = "single" | "range" | "toggle";

type SelectionState = {
  anchorId: NodeId;
  activeId: NodeId;
  selectedIds: Set<NodeId>;
};

type EntityDefinition = {
  id: string;
  label: string;
  schemaName: string;
  description: string;
  schema: z.ZodType<JsonValue, unknown>;
  initialValue: JsonValue;
  childKeys: string[];
  schemaSource: string;
  createValue: (parent: JsonNode, index: number) => JsonValue;
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

const CustomerDirectorySchema = z.object({
  team: z.string().min(1),
  contacts: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)),
  })),
});

const initialCommandDocument: CommandNode = {
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

const initialCustomerDirectory: CustomerDirectory = {
  team: "Field operations",
  contacts: [
    {
      name: "Ari Kim",
      email: "ari@example.com",
      tags: ["buyer", "priority"],
    },
    {
      name: "Bea Park",
      email: "bea@example.com",
      tags: ["ops"],
    },
  ],
};

const entityDefinitions = [
  registerEntity({
    id: "command-tree",
    label: "Command tree",
    schemaName: "CommandNodeSchema",
    description: "Recursive tree entity used for copy, cut, paste, delete, undo, and redo.",
    schema: CommandNodeSchema,
    initialValue: initialCommandDocument,
    childKeys: ["children"],
    schemaSource: `const CommandNodeSchema = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    status: z.union([
      z.literal("draft"),
      z.literal("active"),
      z.literal("done"),
    ]),
    children: z.array(CommandNodeSchema),
  }),
);`,
    createValue: (_parent, index) => ({
      title: `New child ${index}`,
      status: "draft",
      children: [],
    }),
  }),
  registerEntity({
    id: "customer-directory",
    label: "Customer directory",
    schemaName: "CustomerDirectorySchema",
    description: "Zod object entity with contacts and nested tag arrays.",
    schema: CustomerDirectorySchema,
    initialValue: initialCustomerDirectory,
    childKeys: ["contacts", "tags"],
    schemaSource: `const CustomerDirectorySchema = z.object({
  team: z.string().min(1),
  contacts: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)),
  })),
});`,
    createValue: (parent, index) => parent.key === "tags"
      ? `tag-${index}`
      : {
          name: `New contact ${index}`,
          email: `contact${index}@example.com`,
          tags: [],
        },
  }),
] satisfies EntityDefinition[];

const defaultEntityId = entityDefinitions[0]?.id ?? "";

const commands: Array<{ id: CommandId; keys: string; operation: string }> = [
  { id: "copy", keys: "Cmd+C", operation: "copy(selection)" },
  { id: "cut", keys: "Cmd+X", operation: "cut(selection)" },
  { id: "paste", keys: "Cmd+V", operation: "paste(row)" },
  { id: "delete", keys: "Delete", operation: "delete(selection)" },
  { id: "undo", keys: "Cmd+Z", operation: "undo()" },
  { id: "redo", keys: "Cmd+Shift+Z", operation: "redo()" },
];

function registerEntity<T extends JsonValue>(definition: {
  id: string;
  label: string;
  schemaName: string;
  description: string;
  schema: z.ZodType<T, unknown>;
  initialValue: T;
  childKeys: string[];
  schemaSource: string;
  createValue: (parent: JsonNode, index: number) => JsonValue;
}): EntityDefinition {
  return definition as unknown as EntityDefinition;
}

function makeEditor(entity: EntityDefinition) {
  return createJsonCrud(entity.schema, entity.initialValue, { childKeys: entity.childKeys });
}

function makeEditors() {
  return Object.fromEntries(entityDefinitions.map((entity) => [entity.id, makeEditor(entity)]));
}

function entityById(entityId: string): EntityDefinition {
  return entityDefinitions.find((entity) => entity.id === entityId) ?? entityDefinitions[0]!;
}

function App() {
  const editorsRef = useRef(makeEditors());
  const [activeEntityId, setActiveEntityId] = useState(defaultEntityId);
  const activeEntity = entityById(activeEntityId);
  const editorRef = useRef(editorsRef.current[activeEntity.id] ?? makeEditor(activeEntity));
  const nextItemRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<SelectionState>(() => singleSelection(editorRef.current.snapshot().rootId));
  const [activeColumn, setActiveColumn] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(editorRef.current.snapshot()));
  const [clipboardValue, setClipboardValue] = useState<JsonValue | null>(null);
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    target: "/",
    result: { ok: true },
  });

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selection.activeId] === undefined ? doc.rootId : selection.activeId;
  const selectedNode = doc.nodes[safeSelectedId];
  const rows = useMemo(() => buildGridRows(doc, expandedIds), [doc, expandedIds]);
  const selectedIds = useMemo(() => liveSelectedIds(doc, selection, safeSelectedId), [doc, safeSelectedId, selection]);
  const selectedRow = rows.find((row) => row.id === safeSelectedId) ?? rows[0] ?? null;
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;
  const entityStats = useMemo(() => entityDefinitions.map((entity) => ({
    id: entity.id,
    nodes: Object.keys((editorsRef.current[entity.id] ?? makeEditor(entity)).snapshot().nodes).length,
  })), [version]);
  const lastChanges = lastCommand.result.ok ? lastCommand.result.changes ?? [] : [];

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

  const selectGridCell = useCallback((nodeId: NodeId, columnIndex: number, mode: SelectionMode = "single") => {
    setSelection((current) => applySelection(rows, current, nodeId, mode));
    setActiveColumn(clamp(columnIndex, 0, columns.length - 1));
  }, [rows]);

  const runCommand = useCallback((command: CommandId) => {
    const editor = editorRef.current;
    const before = editor.snapshot();
    const targetId = before.nodes[selection.activeId] === undefined ? before.rootId : selection.activeId;
    const targetIds = liveSelectedIds(before, selection, targetId);
    const targetLabel = ["copy", "cut", "delete"].includes(command) && targetIds.size > 1
      ? `${targetIds.size} selected nodes`
      : nodeLabel(before, targetId);
    let result: OperationResult = { ok: true };
    let nextSelection = targetId;
    let collapseToSingleSelection = false;
    let nextSelectionIds: NodeId[] | null = null;

    try {
      if (command === "copy") {
        setClipboardValue(targetIds.size > 1 ? editor.copyMany([...targetIds]) : editor.copy(targetId));
      }

      if (command === "cut") {
        const copied = targetIds.size > 1 ? [...targetIds].map((nodeId) => editor.read(nodeId)) : editor.read(targetId);

        result = targetIds.size > 1 ? editor.cutMany([...targetIds]) : editor.cut(targetId);

        if (result.ok) {
          setClipboardValue(copied);
          nextSelection = result.focusNodeId ?? targetId;
          collapseToSingleSelection = true;
        }
      }

      if (command === "paste") {
        result = editor.paste(targetId);

        if (result.ok) {
          nextSelection = result.focusNodeId ?? result.nodeId ?? targetId;
          nextSelectionIds = result.focusNodeIds ?? null;
          setActiveColumn(0);
          collapseToSingleSelection = true;
        }
      }

      if (command === "delete") {
        const deleteIds = [...targetIds];
        result = deleteIds.length > 1 ? editor.deleteMany(deleteIds) : editor.delete(targetId);

        if (result.ok) {
          nextSelection = result.focusNodeId ?? targetId;
          collapseToSingleSelection = true;
        }
      }

      if (command === "undo") {
        result = editor.undo();

        if (result.ok) {
          nextSelection = result.focusNodeId ?? targetId;
          nextSelectionIds = result.focusNodeIds ?? null;
          setActiveColumn(0);
          collapseToSingleSelection = true;
        }
      }

      if (command === "redo") {
        result = editor.redo();

        if (result.ok) {
          nextSelection = result.focusNodeId ?? targetId;
          nextSelectionIds = result.focusNodeIds ?? null;
          setActiveColumn(0);
          collapseToSingleSelection = true;
        }
      }
    } catch (error) {
      result = failure(error);
    }

    const after = editor.snapshot();

    setExpandedIds((current) => expandedForSelection(after, validExpandedIds(after, current), nextSelection));
    setSelection((current) => {
      const nextActiveId = after.nodes[nextSelection] === undefined ? after.rootId : nextSelection;

      return collapseToSingleSelection
        ? focusSelection(after, nextSelectionIds, nextActiveId)
        : normalizeSelection(after, current, nextActiveId);
    });
    setLastCommand({ command, target: targetLabel, result });
    refresh();
  }, [refresh, selection]);

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
    const childrenId = insertionArrayId(current, targetId, activeEntity.childKeys);

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
    const result: OperationResult = parent === undefined
      ? { ok: false, reason: "Selected insertion target is missing." }
      : editorRef.current.create(childrenId, index, activeEntity.createValue(parent, nextItemRef.current));

    nextItemRef.current += 1;

    const after = editorRef.current.snapshot();

    setExpandedIds((currentExpanded) => {
      const next = validExpandedIds(after, currentExpanded);
      const parentId = after.nodes[childrenId]?.parentId;

      next.add(childrenId);

      if (parentId !== undefined && parentId !== null) {
        next.add(parentId);
      }

      return next;
    });

    if (result.ok && result.focusNodeId !== undefined) {
      setSelection(singleSelection(result.focusNodeId));
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
    editorRef.current = makeEditor(activeEntity);
    editorsRef.current[activeEntity.id] = editorRef.current;
    nextItemRef.current = 1;
    setClipboardValue(null);

    const nextDoc = editorRef.current.snapshot();

    setSelection(singleSelection(nextDoc.rootId));
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setLastCommand({
      command: "reset",
      target: "/",
      result: { ok: true },
    });
    refresh();
  }

  function selectEntity(entityId: string) {
    const nextEntity = entityById(entityId);
    const nextEditor = editorsRef.current[nextEntity.id] ?? makeEditor(nextEntity);

    editorsRef.current[nextEntity.id] = nextEditor;
    editorRef.current = nextEditor;

    const nextDoc = nextEditor.snapshot();

    setActiveEntityId(nextEntity.id);
    setSelection(singleSelection(nextDoc.rootId));
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setClipboardValue(null);
    setLastCommand({
      command: "select entity",
      target: nextEntity.label,
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
          <aside className="panel entity-panel">
            <PanelTitle title="Registered entities" detail={`${entityDefinitions.length} Zod schemas`} />
            <EntityRegistry
              entities={entityDefinitions}
              activeEntityId={activeEntity.id}
              stats={entityStats}
              onSelect={selectEntity}
            />
          </aside>

          <section className="panel editor-panel">
            <PanelTitle
              title={`${activeEntity.label} JsonDoc`}
              detail={selectedRow === null ? "/" : `${selectedRow.path} - ${columns[activeColumn]?.label ?? ""} - ${selectedIds.size} selected`}
            />
            <JsonTreeGrid
              columns={columns}
              rows={rows}
              activeColumn={activeColumn}
              selectedId={safeSelectedId}
              selectedIds={selectedIds}
              onSelect={selectGridCell}
              onMove={selectGridCell}
              onToggle={toggleExpanded}
            />
          </section>

          <aside className="panel detail-panel">
            <PanelTitle title="Zod entity" detail={activeEntity.schemaName} />
            <dl className="result-list">
              <div>
                <dt>Entity</dt>
                <dd>{activeEntity.label}</dd>
              </div>
              <div>
                <dt>Child keys</dt>
                <dd>{activeEntity.childKeys.join(", ")}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{activeEntity.description}</dd>
              </div>
            </dl>
            <pre className="schema-output">{activeEntity.schemaSource}</pre>

            <PanelTitle title="Selected node" detail={safeSelectedId} />
            <dl className="result-list">
              <div>
                <dt>Selection</dt>
                <dd>{selectedIds.size} node{selectedIds.size === 1 ? "" : "s"}</dd>
              </div>
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

            <PanelTitle title="Changed nodes" detail={`${lastChanges.length}`} />
            {lastChanges.length === 0 ? (
              <p className="empty-state">none</p>
            ) : (
              <ol className="change-list">
                {lastChanges.map((change) => (
                  <li key={`${change.type}-${change.nodeId}`} className="change-row">
                    <span className={`change-type ${change.type}`}>{change.type}</span>
                    <span>{change.nodeId}</span>
                    <small>{changeLabel(change)}</small>
                  </li>
                ))}
              </ol>
            )}

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

function EntityRegistry({
  entities,
  activeEntityId,
  stats,
  onSelect,
}: {
  entities: EntityDefinition[];
  activeEntityId: string;
  stats: Array<{ id: string; nodes: number }>;
  onSelect: (entityId: string) => void;
}) {
  return (
    <div className="entity-list">
      {entities.map((entity) => {
        const nodeCount = stats.find((stat) => stat.id === entity.id)?.nodes ?? 0;

        return (
          <button
            key={entity.id}
            type="button"
            className={activeEntityId === entity.id ? "entity-card is-active" : "entity-card"}
            onClick={() => onSelect(entity.id)}
          >
            <span>{entity.label}</span>
            <small>{entity.schemaName}</small>
            <em>{nodeCount} nodes</em>
          </button>
        );
      })}
    </div>
  );
}

function JsonTreeGrid({
  columns,
  rows,
  activeColumn,
  selectedId,
  selectedIds,
  onSelect,
  onMove,
  onToggle,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  activeColumn: number;
  selectedId: NodeId;
  selectedIds: Set<NodeId>;
  onSelect: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onMove: (nodeId: NodeId, columnIndex: number, mode?: SelectionMode) => void;
  onToggle: (nodeId: NodeId) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedIndex = rows.findIndex((row) => row.id === selectedId);
  const visibleIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const activeRowId = rows[visibleIndex]?.id ?? selectedId;
  const activeCellId = cellId(activeRowId, activeColumn);

  function move(deltaRow: number, deltaColumn: number, mode: SelectionMode = "single") {
    const nextRow = rows[clamp(visibleIndex + deltaRow, 0, rows.length - 1)];
    const nextColumn = clamp(activeColumn + deltaColumn, 0, columns.length - 1);

    if (nextRow !== undefined) {
      onMove(nextRow.id, nextColumn, mode);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const commandKey = event.metaKey || event.ctrlKey;

    if (commandKey && event.key === " ") {
      event.preventDefault();
      onSelect(activeRowId, activeColumn, "toggle");
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      onToggle(activeRowId);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1, 0, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(0, 1, event.shiftKey ? "range" : "single");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(0, -1, event.shiftKey ? "range" : "single");
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
          aria-selected={selectedIds.has(row.id)}
          className={[
            "grid-row",
            selectedIds.has(row.id) ? "is-selected" : "",
            selectedId === row.id ? "is-active-row" : "",
          ].filter(Boolean).join(" ")}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={column.id}
              id={cellId(row.id, columnIndex)}
              role="gridcell"
              aria-colindex={columnIndex + 1}
              aria-selected={selectedIds.has(row.id)}
              className={selectedId === row.id && activeColumn === columnIndex ? "grid-cell is-active" : "grid-cell"}
              onClick={(event) => {
                onSelect(row.id, columnIndex, eventSelectionMode(event));
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

function singleSelection(nodeId: NodeId): SelectionState {
  return {
    anchorId: nodeId,
    activeId: nodeId,
    selectedIds: new Set([nodeId]),
  };
}

function focusSelection(doc: JsonDoc, nodeIds: NodeId[] | null, activeId: NodeId): SelectionState {
  if (nodeIds === null || nodeIds.length === 0) {
    return singleSelection(activeId);
  }

  const selectedIds = nodeIds.filter((nodeId) => doc.nodes[nodeId] !== undefined);

  if (selectedIds.length === 0) {
    return singleSelection(activeId);
  }

  const nextActiveId = doc.nodes[activeId] === undefined ? selectedIds[0]! : activeId;

  return {
    anchorId: selectedIds[0]!,
    activeId: nextActiveId,
    selectedIds: new Set(selectedIds),
  };
}

function liveSelectedIds(doc: JsonDoc, selection: SelectionState, fallbackId: NodeId): Set<NodeId> {
  const ids = new Set<NodeId>();

  for (const nodeId of selection.selectedIds) {
    if (doc.nodes[nodeId] !== undefined) {
      ids.add(nodeId);
    }
  }

  if (ids.size === 0) {
    ids.add(doc.nodes[fallbackId] === undefined ? doc.rootId : fallbackId);
  }

  return ids;
}

function normalizeSelection(doc: JsonDoc, selection: SelectionState, fallbackId: NodeId): SelectionState {
  const activeId = doc.nodes[selection.activeId] === undefined
    ? doc.nodes[fallbackId] === undefined ? doc.rootId : fallbackId
    : selection.activeId;
  const selectedIds = liveSelectedIds(doc, selection, activeId);
  const anchorId = doc.nodes[selection.anchorId] === undefined ? activeId : selection.anchorId;

  return {
    anchorId,
    activeId,
    selectedIds,
  };
}

function applySelection(
  rows: GridRow[],
  current: SelectionState,
  nodeId: NodeId,
  mode: SelectionMode,
): SelectionState {
  if (mode === "range") {
    const rangeIds = visibleRangeIds(rows, current.anchorId, nodeId);

    return {
      anchorId: current.anchorId,
      activeId: nodeId,
      selectedIds: new Set(rangeIds.length === 0 ? [nodeId] : rangeIds),
    };
  }

  if (mode === "toggle") {
    const selectedIds = new Set(current.selectedIds);

    if (selectedIds.has(nodeId) && selectedIds.size > 1) {
      selectedIds.delete(nodeId);
    } else {
      selectedIds.add(nodeId);
    }

    return {
      anchorId: nodeId,
      activeId: nodeId,
      selectedIds,
    };
  }

  return singleSelection(nodeId);
}

function visibleRangeIds(rows: GridRow[], anchorId: NodeId, activeId: NodeId): NodeId[] {
  const anchorIndex = rows.findIndex((row) => row.id === anchorId);
  const activeIndex = rows.findIndex((row) => row.id === activeId);

  if (anchorIndex < 0 || activeIndex < 0) {
    return [];
  }

  const start = Math.min(anchorIndex, activeIndex);
  const end = Math.max(anchorIndex, activeIndex);

  return rows.slice(start, end + 1).map((row) => row.id);
}

function eventSelectionMode(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectionMode {
  if (event.shiftKey) {
    return "range";
  }

  if (event.metaKey || event.ctrlKey) {
    return "toggle";
  }

  return "single";
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

function expandedForSelection(doc: JsonDoc, ids: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
  const next = validExpandedIds(doc, ids);
  let current = doc.nodes[nodeId];

  while (current?.parentId !== null && current?.parentId !== undefined) {
    const parent = doc.nodes[current.parentId];

    if (parent !== undefined && parent.children.length > 0) {
      next.add(parent.id);
    }

    current = parent;
  }

  return next;
}

function insertionArrayId(doc: JsonDoc, nodeId: NodeId, childKeys: string[]): NodeId | null {
  let current = doc.nodes[nodeId];

  while (current !== undefined) {
    if (current.type === "array") {
      return current.id;
    }

    if (current.type === "object") {
      for (const childKey of childKeys) {
        const child = childByKey(doc, current.id, childKey);

        if (child?.type === "array") {
          return child.id;
        }
      }
    }

    current = current.parentId === null ? undefined : doc.nodes[current.parentId];
  }

  return null;
}

function childByKey(doc: JsonDoc, nodeId: NodeId, key: string | number): JsonNode | undefined {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return undefined;
  }

  const childId = node.children.find((id) => doc.nodes[id]?.key === key);
  return childId === undefined ? undefined : doc.nodes[childId];
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

function changeLabel(change: JsonChange): string {
  if (change.type === "insert") {
    return nodeChangeLabel(change.after);
  }

  if (change.type === "delete") {
    return nodeChangeLabel(change.before);
  }

  return `${nodeChangeLabel(change.before)} -> ${nodeChangeLabel(change.after)}`;
}

function nodeChangeLabel(node: JsonNode): string {
  const key = node.key === null ? "root" : String(node.key);
  const value = node.children.length > 0 ? `${node.children.length} children` : nodeValueLabel(node);

  return `${key} - ${node.type}${value === "" ? "" : ` - ${value}`}`;
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
