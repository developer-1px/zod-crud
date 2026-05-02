import {
  Braces,
  Clipboard,
  Copy,
  History,
  Layers,
  MousePointer2,
  Move,
  Pencil,
  Redo2,
  RefreshCcw,
  Scissors,
  SlidersHorizontal,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import * as z from "zod";

import {
  createJsonCrud,
  deserialize,
  type JsonDoc,
  type JsonNode,
  type JsonValue,
  type NodeId,
  type OperationResult,
} from "zod-crud";

import "./styles.css";

type UiNode =
  | {
      kind: "frame";
      name: string;
      fill: string;
      children: UiNode[];
    }
  | {
      kind: "text";
      text: string;
      tone: "ink" | "accent" | "danger";
    }
  | {
      kind: "rect";
      label: string;
      fill: "teal" | "amber" | "violet";
      width: number;
      height: number;
    };

const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("frame"),
      name: z.string(),
      fill: z.string(),
      children: z.array(UiNodeSchema),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string(),
      tone: z.union([z.literal("ink"), z.literal("accent"), z.literal("danger")]),
    }),
    z.object({
      kind: z.literal("rect"),
      label: z.string(),
      fill: z.union([z.literal("teal"), z.literal("amber"), z.literal("violet")]),
      width: z.number().min(40).max(420),
      height: z.number().min(24).max(180),
    }),
  ]),
);

const initialJson: UiNode = {
  kind: "frame",
  name: "Root",
  fill: "#f7f8fa",
  children: [
    {
      kind: "frame",
      name: "Toolbar",
      fill: "#ffffff",
      children: [
        { kind: "text", text: "Document Header", tone: "ink" },
        { kind: "rect", label: "Action", fill: "teal", width: 124, height: 34 },
      ],
    },
    { kind: "text", text: "Validated Text", tone: "accent" },
    { kind: "rect", label: "Panel", fill: "violet", width: 180, height: 72 },
  ],
};

type LogEntry = {
  id: number;
  label: string;
  ok: boolean;
  reason?: string;
};

function makeEditor() {
  return createJsonCrud(UiNodeSchema, initialJson);
}

function App() {
  const editorRef = useRef(makeEditor());
  const nextLogIdRef = useRef(2);
  const initialRootId = editorRef.current.snapshot().rootId;
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<NodeId>(initialRootId);
  const [focusedIds, setFocusedIds] = useState<NodeId[]>([initialRootId]);
  const [clipboardJson, setClipboardJson] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, label: "load initial JSON", ok: true },
  ]);

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const json = useMemo(() => editorRef.current.toJson(), [version]);
  const selectedNode = doc.nodes[selectedId] ?? doc.nodes[doc.rootId];
  const focusedSet = useMemo(() => new Set(focusedIds.filter((id) => doc.nodes[id] !== undefined)), [doc, focusedIds]);

  useEffect(() => {
    const recovered = recoverFocus(doc, focusedIds, selectedId);

    if (selectedId !== recovered.selectedId) {
      setSelectedId(recovered.selectedId);
    }

    if (!sameIds(focusedIds, recovered.focusedIds)) {
      setFocusedIds(recovered.focusedIds);
    }
  }, [doc, focusedIds, selectedId]);

  const pasteStatus = useMemo(() => {
    if (clipboardJson.length === 0) {
      return {};
    }

    const statuses: Record<NodeId, OperationResult> = {};

    for (const nodeId of Object.keys(doc.nodes)) {
      statuses[nodeId] = editorRef.current.canPaste(nodeId);
    }

    return statuses;
  }, [clipboardJson, doc]);
  const selectedPasteStatus = pasteStatus[selectedId];
  const canCreateChild = findInsertionArray(doc, selectedId) !== null;
  const canUpdateSelected = editableStringNodeId(doc, selectedId) !== null;
  const canCutSelected = selectedId !== doc.rootId;
  const canDeleteSelected = selectedId !== doc.rootId;
  const canPasteSelected = selectedPasteStatus?.ok === true;
  const canUndo = editorRef.current.canUndo();
  const canRedo = editorRef.current.canRedo();

  function refresh() {
    setVersion((current) => current + 1);
  }

  function pushLog(label: string, result: OperationResult | boolean | "ok") {
    const ok = result === true || result === "ok" || (typeof result === "object" && result.ok);
    const reason = typeof result === "object" && !result.ok ? result.reason : undefined;
    const entry: LogEntry = { id: nextLogIdRef.current, label, ok };
    nextLogIdRef.current += 1;

    if (reason !== undefined) {
      entry.reason = reason;
    }

    setLogs((current) => [
      entry,
      ...current.slice(0, 8),
    ]);
  }

  function selectNode(nodeId: NodeId) {
    setSelectedId(nodeId);
    setFocusedIds([nodeId]);
  }

  function focusFromChange(before: JsonDoc, after: JsonDoc, nextFocusIds = diffFocusIds(before, after)) {
    const recovered = recoverChangeFocus(after, nextFocusIds, selectedId);

    setSelectedId(recovered.selectedId);
    setFocusedIds(recovered.focusedIds);
  }

  function run(
    label: string,
    operation: () => OperationResult | boolean | "ok",
    focusResolver?: (before: JsonDoc, after: JsonDoc) => NodeId[],
  ) {
    const before = editorRef.current.snapshot();
    const result = operation();
    const after = editorRef.current.snapshot();

    if (operationSucceeded(result) && !sameDoc(before, after)) {
      focusFromChange(before, after, focusResolver?.(before, after));
    }

    pushLog(label, result);
    refresh();
  }

  function copySelected() {
    const value = editorRef.current.copy(selectedId);
    setClipboardJson(JSON.stringify(value, null, 2));
    pushLog(`copy ${selectedId}`, "ok");
  }

  function cutSelected() {
    const value = editorRef.current.read(selectedId);
    const targetId = selectedId;

    run(
      `cut ${targetId}`,
      () => {
        const result = editorRef.current.cut(targetId);

        if (result.ok) {
          setClipboardJson(JSON.stringify(value, null, 2));
        }

        return result;
      },
      (before, after) => deletionFocusIds(before, after, targetId),
    );
  }

  function pasteSelected() {
    run(`paste into ${selectedId}`, () => editorRef.current.paste(selectedId));
  }

  function deleteSelected() {
    const targetId = selectedId;

    run(
      `delete ${targetId}`,
      () => editorRef.current.delete(targetId),
      (before, after) => deletionFocusIds(before, after, targetId),
    );
  }

  function appendText() {
    run("create text child", () => {
      const targetArrayId = findInsertionArray(doc, selectedId);

      if (targetArrayId === null) {
        return { ok: false, reason: "Selected node has no child array." };
      }

      const arrayNode = doc.nodes[targetArrayId];

      if (arrayNode === undefined) {
        return { ok: false, reason: "Target child array is missing." };
      }

      return editorRef.current.create(targetArrayId, arrayNode.children.length, {
        kind: "text",
        text: `Text ${arrayNode.children.length + 1}`,
        tone: "ink",
      });
    });
  }

  function appendRect() {
    run("create rect child", () => {
      const targetArrayId = findInsertionArray(doc, selectedId);

      if (targetArrayId === null) {
        return { ok: false, reason: "Selected node has no child array." };
      }

      const arrayNode = doc.nodes[targetArrayId];

      if (arrayNode === undefined) {
        return { ok: false, reason: "Target child array is missing." };
      }

      return editorRef.current.create(targetArrayId, arrayNode.children.length, {
        kind: "rect",
        label: `Box ${arrayNode.children.length + 1}`,
        fill: "amber",
        width: 132,
        height: 48,
      });
    });
  }

  function editSelected() {
    run(`update ${selectedId}`, () => {
      const targetId = editableStringNodeId(doc, selectedId);

      if (targetId === null) {
        return { ok: false, reason: "Selected node has no editable text field." };
      }

      return editorRef.current.update(targetId, `Edited ${new Date().toLocaleTimeString()}`);
    });
  }

  function reset() {
    editorRef.current = makeEditor();
    setSelectedId(editorRef.current.snapshot().rootId);
    setFocusedIds([editorRef.current.snapshot().rootId]);
    setClipboardJson("");
    pushLog("reset document", "ok");
    refresh();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (
        (key === "backspace" || key === "delete") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (!canDeleteSelected) {
          return;
        }

        event.preventDefault();
        deleteSelected();
        return;
      }

      const isCommand = event.metaKey || event.ctrlKey;

      if (!isCommand || event.altKey) {
        return;
      }

      if (key === "c" && !event.shiftKey) {
        event.preventDefault();
        copySelected();
        return;
      }

      if (key === "x" && !event.shiftKey) {
        if (!canCutSelected) {
          return;
        }

        event.preventDefault();
        cutSelected();
        return;
      }

      if (key === "v" && !event.shiftKey) {
        if (!canPasteSelected) {
          return;
        }

        event.preventDefault();
        pasteSelected();
        return;
      }

      if (key === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          if (canRedo) {
            run("redo shortcut", () => editorRef.current.redo());
          }
        } else {
          if (canUndo) {
            run("undo shortcut", () => editorRef.current.undo());
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="window-controls" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-lockup">
            <h1>zod-crud</h1>
            <p>Visual editor</p>
          </div>
        </div>

        <div className="mode-switch" aria-label="Workspace mode">
          <button className="mode-tab active" type="button">Design</button>
          <button className="mode-tab" type="button">Data</button>
          <button className="mode-tab" type="button">History</button>
        </div>

        <div className="toolbar top-actions" aria-label="History controls">
          <IconButton label="Undo" shortcut="Cmd+Z" onClick={() => run("undo", () => editorRef.current.undo())} icon={<Undo2 />} disabled={!canUndo} />
          <IconButton label="Redo" shortcut="Shift+Cmd+Z" onClick={() => run("redo", () => editorRef.current.redo())} icon={<Redo2 />} disabled={!canRedo} />
          <IconButton label="Reset" onClick={reset} icon={<RefreshCcw />} />
        </div>
      </header>

      <section className="workspace">
        <nav className="tool-rail" aria-label="Editing tools">
          <button
            className="rail-tool active"
            type="button"
            title="Select"
            aria-label="Select"
            onClick={() => selectNode(selectedId)}
          >
            <MousePointer2 />
          </button>
          <IconButton label="Create text" onClick={appendText} icon={<Type />} disabled={!canCreateChild} />
          <IconButton label="Create rect" onClick={appendRect} icon={<Square />} disabled={!canCreateChild} />
          <IconButton label="Update" onClick={editSelected} icon={<Pencil />} disabled={!canUpdateSelected} />
          <div className="rail-separator" />
          <IconButton label="Copy" shortcut="Cmd+C" onClick={copySelected} icon={<Copy />} />
          <IconButton label="Cut" shortcut="Cmd+X" onClick={cutSelected} icon={<Scissors />} disabled={!canCutSelected} />
          <IconButton
            label="Paste"
            shortcut="Cmd+V"
            onClick={pasteSelected}
            icon={<Clipboard />}
            disabled={!canPasteSelected}
          />
          <IconButton label="Delete" shortcut="Delete" onClick={deleteSelected} icon={<Trash2 />} tone="danger" disabled={!canDeleteSelected} />
        </nav>

        <aside className="panel tree-panel">
          <PanelTitle icon={<Layers />} title="Layers" />
          <TreeView
            doc={doc}
            nodeId={doc.rootId}
            selectedId={selectedId}
            focusedSet={focusedSet}
            pasteStatus={pasteStatus}
            onSelect={selectNode}
          />
        </aside>

        <section className="canvas-shell">
          <div className="canvas-titlebar">
            <div className="canvas-title">
              <Move />
              <h2>Canvas</h2>
              <span>{Object.keys(doc.nodes).length} nodes</span>
            </div>
            <div className="canvas-controls" aria-label="Canvas view controls">
              <button type="button" title="Zoom out" aria-label="Zoom out"><ZoomOut /></button>
              <span>100%</span>
              <button type="button" title="Zoom in" aria-label="Zoom in"><ZoomIn /></button>
            </div>
          </div>

          <div className="canvas-viewport">
            <div className="canvas-stage">
              <CanvasNode
                doc={doc}
                nodeId={doc.rootId}
                selectedId={selectedId}
                focusedSet={focusedSet}
                pasteStatus={pasteStatus}
                onSelect={selectNode}
              />
            </div>
          </div>
        </section>

        <aside className="inspector">
          <section className="panel selection-panel">
            <PanelTitle icon={<SlidersHorizontal />} title="Inspector" />
            <dl className="property-grid">
              <div>
                <dt>Selection</dt>
                <dd>{selectedNode === undefined ? "none" : nodeLabel(doc, selectedNode)}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{selectedNode?.id ?? "none"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedNode?.type ?? "none"}</dd>
              </div>
              <div>
                <dt>Parent</dt>
                <dd>{selectedNode?.parentId ?? "root"}</dd>
              </div>
              <div>
                <dt>Children</dt>
                <dd>{selectedNode?.children.length ?? 0}</dd>
              </div>
              <div>
                <dt>Focus</dt>
                <dd>{focusedSet.size}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <PanelTitle icon={<Table2 />} title="Nodes" />
            <NodeTable
              doc={doc}
              selectedId={selectedId}
              focusedSet={focusedSet}
              pasteStatus={pasteStatus}
              onSelect={selectNode}
            />
          </section>

          <section className="panel split-panel">
            <div>
              <PanelTitle icon={<Braces />} title="JSON" />
              <pre className="json-view">{JSON.stringify(json, null, 2)}</pre>
            </div>
            <div>
              <PanelTitle icon={<Clipboard />} title="Clipboard" />
              <pre className="json-view clipboard-view">{clipboardJson || "empty"}</pre>
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={<History />} title="Timeline" />
            <ul className="log-list">
              {logs.map((entry) => (
                <li key={entry.id} className={entry.ok ? "ok" : "fail"}>
                  <span>{entry.label}</span>
                  <small>{entry.ok ? "ok" : entry.reason}</small>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>

      <footer className="statusbar">
        <span>selected <strong>{selectedNode?.id ?? "none"}</strong></span>
        <span>focus <strong>{focusedSet.size > 0 ? [...focusedSet].join(", ") : "none"}</strong></span>
        <span>type <strong>{selectedNode?.type ?? "none"}</strong></span>
        <span>nodes <strong>{Object.keys(doc.nodes).length}</strong></span>
      </footer>
    </main>
  );
}

function IconButton({
  label,
  shortcut,
  icon,
  onClick,
  tone = "neutral",
  disabled = false,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${tone}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut === undefined ? label : `${label} (${shortcut})`}
    >
      {icon}
      <span>{label}</span>
      {shortcut === undefined ? null : <kbd>{shortcut}</kbd>}
    </button>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function TreeView({
  doc,
  nodeId,
  selectedId,
  focusedSet,
  pasteStatus,
  onSelect,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
  pasteStatus: Record<NodeId, OperationResult>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  return (
    <ul className="tree-list">
      <li>
        <button
          type="button"
          className={nodeClass("tree-item", nodeId, selectedId, focusedSet, pasteStatus)}
          onClick={() => onSelect(nodeId)}
        >
          <span>{nodeLabel(doc, node)}</span>
          <small>{node.id}</small>
        </button>
        {node.children.length > 0 ? (
          <div className="tree-children">
            {node.children.map((childId) => (
              <TreeView
                key={childId}
                doc={doc}
                nodeId={childId}
                selectedId={selectedId}
                focusedSet={focusedSet}
                pasteStatus={pasteStatus}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </li>
    </ul>
  );
}

function CanvasNode({
  doc,
  nodeId,
  selectedId,
  focusedSet,
  pasteStatus,
  onSelect,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
  pasteStatus: Record<NodeId, OperationResult>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  const value = deserialize(doc, nodeId);
  const className = nodeClass("canvas-node", nodeId, selectedId, focusedSet, pasteStatus);

  if (isUiFrame(value)) {
    const childrenArrayId = childIdByKey(doc, nodeId, "children");
    const childIds = childrenArrayId ? doc.nodes[childrenArrayId]?.children ?? [] : [];

    return (
      <div
        className={`${className} frame-node`}
        style={{ background: value.fill }}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      >
        <div className="frame-header">
          <strong>{value.name}</strong>
          <small>{nodeId}</small>
        </div>
        <div className="frame-children">
          {childIds.map((childId) => (
            <CanvasNode
              key={childId}
              doc={doc}
              nodeId={childId}
              selectedId={selectedId}
              focusedSet={focusedSet}
              pasteStatus={pasteStatus}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isUiText(value)) {
    return (
      <div
        className={`${className} text-node tone-${value.tone}`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      >
        {value.text}
      </div>
    );
  }

  if (isUiRect(value)) {
    return (
      <div
        className={`${className} rect-node fill-${value.fill}`}
        style={{ width: value.width, minHeight: value.height }}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      >
        {value.label}
      </div>
    );
  }

  return (
    <button type="button" className={`${className} leaf-node`} onClick={() => onSelect(nodeId)}>
      {nodeLabel(doc, node)}
    </button>
  );
}

function selectNodeFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  nodeId: NodeId,
  onSelect: (nodeId: NodeId) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  onSelect(nodeId);
}

function NodeTable({
  doc,
  selectedId,
  focusedSet,
  pasteStatus,
  onSelect,
}: {
  doc: JsonDoc;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
  pasteStatus: Record<NodeId, OperationResult>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const rows = Object.values(doc.nodes);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>type</th>
            <th>parent</th>
            <th>key</th>
            <th>children</th>
            <th>value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((node) => (
            <tr
              key={node.id}
              className={nodeClass("", node.id, selectedId, focusedSet, pasteStatus)}
              onClick={() => onSelect(node.id)}
            >
              <td>{node.id}</td>
              <td>{node.type}</td>
              <td>{node.parentId ?? "null"}</td>
              <td>{node.key ?? "null"}</td>
              <td>{node.children.join(", ") || "-"}</td>
              <td>{node.value === undefined ? "-" : String(node.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function nodeClass(
  base: string,
  nodeId: NodeId,
  selectedId: NodeId,
  focusedSet: Set<NodeId>,
  pasteStatus: Record<NodeId, OperationResult>,
) {
  const status = pasteStatus[nodeId];
  const classes = [base];

  if (focusedSet.has(nodeId)) {
    classes.push("focused");
  }

  if (nodeId === selectedId) {
    classes.push("selected");
  }

  if (status !== undefined) {
    classes.push(status.ok ? "paste-ok" : "paste-fail");
  }

  return classes.filter(Boolean).join(" ");
}

function nodeLabel(doc: JsonDoc, node: JsonNode) {
  const key = node.key === null ? "$" : String(node.key);

  if (node.type === "object") {
    const kind = primitiveField(doc, node.id, "kind");
    return kind ? `${key}: ${kind}` : `${key}: object`;
  }

  if (node.type === "array") {
    return `${key}: array[${node.children.length}]`;
  }

  return `${key}: ${String(node.value)}`;
}

function primitiveField(doc: JsonDoc, objectId: NodeId, key: string) {
  const childId = childIdByKey(doc, objectId, key);

  if (childId === null) {
    return null;
  }

  const child = doc.nodes[childId];

  if (child === undefined || child.children.length > 0) {
    return null;
  }

  return child.value === undefined ? null : String(child.value);
}

function childIdByKey(doc: JsonDoc, parentId: NodeId, key: string | number) {
  const parent = doc.nodes[parentId];

  if (parent === undefined) {
    return null;
  }

  return parent.children.find((childId) => doc.nodes[childId]?.key === key) ?? null;
}

function findInsertionArray(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  if (node.type === "array") {
    return nodeId;
  }

  if (node.type === "object") {
    const childrenId = childIdByKey(doc, nodeId, "children");
    const children = childrenId ? doc.nodes[childrenId] : undefined;
    return children?.type === "array" ? children.id : null;
  }

  return null;
}

function editableStringNodeId(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  if (node.type === "string" && (node.key === "text" || node.key === "name" || node.key === "label")) {
    return nodeId;
  }

  if (node.type === "object") {
    for (const key of ["text", "name", "label"]) {
      const childId = childIdByKey(doc, nodeId, key);
      const child = childId ? doc.nodes[childId] : undefined;

      if (child?.type === "string") {
        return child.id;
      }
    }
  }

  return null;
}

function operationSucceeded(result: OperationResult | boolean | "ok") {
  return result === true || result === "ok" || (typeof result === "object" && result.ok);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function recoverFocus(doc: JsonDoc, focusedIds: NodeId[], selectedId: NodeId) {
  const existingFocusIds = uniqueIds(focusedIds.filter((id) => doc.nodes[id] !== undefined));

  if (existingFocusIds.length > 0) {
    return {
      selectedId: doc.nodes[selectedId] !== undefined ? selectedId : existingFocusIds[0]!,
      focusedIds: existingFocusIds,
    };
  }

  const fallback = doc.nodes[selectedId] !== undefined ? selectedId : doc.rootId;

  return {
    selectedId: fallback,
    focusedIds: [fallback],
  };
}

function recoverChangeFocus(doc: JsonDoc, focusedIds: NodeId[], fallbackId: NodeId) {
  const existingFocusIds = uniqueIds(focusedIds.filter((id) => doc.nodes[id] !== undefined));
  const selectedId =
    firstVisibleFocusId(doc, existingFocusIds) ??
    firstExisting(doc, existingFocusIds) ??
    (doc.nodes[fallbackId] !== undefined ? fallbackId : doc.rootId);

  return {
    selectedId,
    focusedIds: existingFocusIds.length > 0 ? existingFocusIds : [selectedId],
  };
}

function firstVisibleFocusId(doc: JsonDoc, focusedIds: NodeId[]): NodeId | null {
  for (const id of focusedIds) {
    const node = doc.nodes[id];

    if (node !== undefined && !isHiddenStructureNode(node)) {
      return id;
    }
  }

  return null;
}

function diffFocusIds(before: JsonDoc, after: JsonDoc): NodeId[] {
  const allIds = uniqueIds([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);
  const changedIds: NodeId[] = [];

  for (const id of allIds) {
    const beforeNode = before.nodes[id];
    const afterNode = after.nodes[id];

    if (beforeNode === undefined && afterNode !== undefined) {
      changedIds.push(id);
      continue;
    }

    if (beforeNode !== undefined && afterNode === undefined) {
      changedIds.push(recoverRemovedNode(before, after, id));
      continue;
    }

    if (
      beforeNode !== undefined &&
      afterNode !== undefined &&
      nodeFingerprint(beforeNode) !== nodeFingerprint(afterNode)
    ) {
      changedIds.push(id);
    }
  }

  return sortByDocumentOrder(after, uniqueIds(changedIds));
}

function deletionFocusIds(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId[] {
  if (after.nodes[removedId] !== undefined) {
    return [removedId];
  }

  const removedNode = before.nodes[removedId];

  if (removedNode?.parentId === null || removedNode?.parentId === undefined) {
    return [after.rootId];
  }

  const parentBefore = before.nodes[removedNode.parentId];

  if (parentBefore === undefined) {
    return [after.rootId];
  }

  const removedIndex = parentBefore.children.indexOf(removedId);

  if (removedIndex >= 0) {
    const nextSiblingId = firstExisting(after, parentBefore.children.slice(removedIndex + 1));

    if (nextSiblingId !== null) {
      return [nextSiblingId];
    }

    const previousSiblingId = firstExisting(after, parentBefore.children.slice(0, removedIndex).reverse());

    if (previousSiblingId !== null) {
      return [previousSiblingId];
    }
  }

  return [recoverParentForRemovedNode(before, after, parentBefore.id)];
}

function firstExisting(doc: JsonDoc, nodeIds: NodeId[]): NodeId | null {
  return nodeIds.find((id) => doc.nodes[id] !== undefined) ?? null;
}

function recoverParentForRemovedNode(before: JsonDoc, after: JsonDoc, parentId: NodeId): NodeId {
  let current = before.nodes[parentId];

  while (current !== undefined) {
    if (after.nodes[current.id] !== undefined && !isHiddenStructureNode(current)) {
      return current.id;
    }

    if (current.parentId === null) {
      break;
    }

    current = before.nodes[current.parentId];
  }

  return after.rootId;
}

function isHiddenStructureNode(node: JsonNode) {
  return node.type === "array" && node.key === "children";
}

function recoverRemovedNode(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId {
  const removedNode = before.nodes[removedId];

  if (removedNode?.parentId === null || removedNode?.parentId === undefined) {
    return after.rootId;
  }

  return recoverParentForRemovedNode(before, after, removedNode.parentId);
}

function sortByDocumentOrder(doc: JsonDoc, ids: NodeId[]): NodeId[] {
  const order = new Map<NodeId, number>();
  const visit = (nodeId: NodeId) => {
    const node = doc.nodes[nodeId];

    if (node === undefined) {
      return;
    }

    order.set(nodeId, order.size);

    for (const childId of node.children) {
      visit(childId);
    }
  };

  visit(doc.rootId);

  return [...ids].sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function nodeFingerprint(node: JsonNode) {
  return JSON.stringify({
    type: node.type,
    parentId: node.parentId,
    key: node.key,
    children: node.children,
    value: node.value,
  });
}

function sameDoc(left: JsonDoc, right: JsonDoc) {
  if (left.rootId !== right.rootId) {
    return false;
  }

  const leftIds = Object.keys(left.nodes).sort();
  const rightIds = Object.keys(right.nodes).sort();

  if (!sameIds(leftIds, rightIds)) {
    return false;
  }

  return leftIds.every((id) => {
    const leftNode = left.nodes[id];
    const rightNode = right.nodes[id];
    return leftNode !== undefined && rightNode !== undefined && nodeFingerprint(leftNode) === nodeFingerprint(rightNode);
  });
}

function sameIds(left: NodeId[], right: NodeId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function uniqueIds(ids: NodeId[]) {
  return [...new Set(ids)];
}

function isUiFrame(value: JsonValue): value is Extract<UiNode, { kind: "frame" }> {
  return isRecord(value) && value.kind === "frame" && Array.isArray(value.children);
}

function isUiText(value: JsonValue): value is Extract<UiNode, { kind: "text" }> {
  return isRecord(value) && value.kind === "text" && typeof value.text === "string";
}

function isUiRect(value: JsonValue): value is Extract<UiNode, { kind: "rect" }> {
  return isRecord(value) && value.kind === "rect" && typeof value.label === "string";
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
