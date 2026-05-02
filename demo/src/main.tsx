import {
  Clipboard,
  Copy,
  FileJson2,
  History,
  Pencil,
  Redo2,
  RefreshCcw,
  Scissors,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
} from "../../src/index.js";

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

  function refresh() {
    setVersion((current) => current + 1);
  }

  function pushLog(label: string, result: OperationResult | boolean | "ok") {
    const ok = result === true || result === "ok" || (typeof result === "object" && result.ok);
    const reason = typeof result === "object" && !result.ok ? result.reason : undefined;
    const entry: LogEntry = { id: Date.now(), label, ok };

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

  function focusFromChange(before: JsonDoc, after: JsonDoc) {
    const diffIds = diffFocusIds(before, after);
    const recovered = recoverFocus(after, diffIds, selectedId);

    setSelectedId(recovered.selectedId);
    setFocusedIds(recovered.focusedIds);
  }

  function run(label: string, operation: () => OperationResult | boolean | "ok") {
    const before = editorRef.current.snapshot();
    const result = operation();
    const after = editorRef.current.snapshot();

    if (operationSucceeded(result) && !sameDoc(before, after)) {
      focusFromChange(before, after);
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
    run(`cut ${selectedId}`, () => {
      const result = editorRef.current.cut(selectedId);

      if (result.ok) {
        setClipboardJson(JSON.stringify(value, null, 2));
      }

      return result;
    });
  }

  function pasteSelected() {
    run(`paste into ${selectedId}`, () => editorRef.current.paste(selectedId));
  }

  function deleteSelected() {
    run(`delete ${selectedId}`, () => editorRef.current.delete(selectedId));
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

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>zod-crud visual test</h1>
          <p>JSON CRUD copy paste history</p>
        </div>
        <div className="toolbar" aria-label="Operations">
          <IconButton label="Create text" onClick={appendText} icon={<Type />} />
          <IconButton label="Create rect" onClick={appendRect} icon={<Square />} />
          <IconButton label="Update" onClick={editSelected} icon={<Pencil />} />
          <IconButton label="Copy" onClick={copySelected} icon={<Copy />} />
          <IconButton label="Cut" onClick={cutSelected} icon={<Scissors />} />
          <IconButton label="Paste" onClick={pasteSelected} icon={<Clipboard />} />
          <IconButton label="Delete" onClick={deleteSelected} icon={<Trash2 />} tone="danger" />
          <IconButton label="Undo" onClick={() => run("undo", () => editorRef.current.undo())} icon={<Undo2 />} />
          <IconButton label="Redo" onClick={() => run("redo", () => editorRef.current.redo())} icon={<Redo2 />} />
          <IconButton label="Reset" onClick={reset} icon={<RefreshCcw />} />
        </div>
      </header>

      <section className="workspace">
        <aside className="panel tree-panel">
          <PanelTitle icon={<History />} title="Tree" />
          <TreeView
            doc={doc}
            nodeId={doc.rootId}
            selectedId={selectedId}
            focusedSet={focusedSet}
            pasteStatus={pasteStatus}
            onSelect={selectNode}
          />
        </aside>

        <section className="panel canvas-panel">
          <PanelTitle icon={<Square />} title="Rendered JSON" />
          <CanvasNode
            doc={doc}
            nodeId={doc.rootId}
            selectedId={selectedId}
            focusedSet={focusedSet}
            pasteStatus={pasteStatus}
            onSelect={selectNode}
          />
        </section>

        <aside className="inspector">
          <section className="panel">
            <PanelTitle icon={<Table2 />} title="Flat Nodes" />
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
              <PanelTitle icon={<FileJson2 />} title="JSON" />
              <pre className="json-view">{JSON.stringify(json, null, 2)}</pre>
            </div>
            <div>
              <PanelTitle icon={<Clipboard />} title="Clipboard" />
              <pre className="json-view clipboard-view">{clipboardJson || "empty"}</pre>
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={<History />} title="History" />
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
        <span>selected: {selectedNode?.id ?? "none"}</span>
        <span>focus: {focusedSet.size > 0 ? [...focusedSet].join(", ") : "none"}</span>
        <span>type: {selectedNode?.type ?? "none"}</span>
        <span>nodes: {Object.keys(doc.nodes).length}</span>
      </footer>
    </main>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  tone = "neutral",
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button className={`icon-button ${tone}`} type="button" onClick={onClick} title={label}>
      {icon}
      <span>{label}</span>
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

function recoverRemovedNode(before: JsonDoc, after: JsonDoc, removedId: NodeId): NodeId {
  let current = before.nodes[removedId];

  while (current?.parentId !== null && current?.parentId !== undefined) {
    const parent = after.nodes[current.parentId];

    if (parent !== undefined) {
      return parent.id;
    }

    current = before.nodes[current.parentId];
  }

  return after.rootId;
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
