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

type DomainNode = {
  id: NodeId;
  title: string;
  status: CommandNode["status"];
  childCount: number;
  path: string;
};

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
  { id: "copy", keys: "Cmd+C", operation: "copy(selectedId)" },
  { id: "cut", keys: "Cmd+X", operation: "cut(selectedId)" },
  { id: "paste", keys: "Cmd+V", operation: "paste(selectedId)" },
  { id: "delete", keys: "Delete", operation: "delete(selectedId)" },
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
  const [clipboardValue, setClipboardValue] = useState<JsonValue | null>(null);
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    target: "Command document",
    result: { ok: true },
  });

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selectedId] === undefined ? doc.rootId : selectedId;
  const selectedDomain = useMemo(() => domainNodeFromId(doc, safeSelectedId), [doc, safeSelectedId]);
  const domainNodes = useMemo(() => toDomainNodes(doc), [doc]);
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const nodeRows = useMemo(() => Object.values(doc.nodes), [doc]);
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const runCommand = useCallback((command: CommandId) => {
    const editor = editorRef.current;
    const before = editor.snapshot();
    const targetId = before.nodes[selectedId] === undefined ? before.rootId : selectedId;
    const targetTitle = domainNodeFromId(before, targetId)?.title ?? targetId;
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

    setSelectedId(after.nodes[nextSelection] === undefined ? after.rootId : nextSelection);
    setLastCommand({ command, target: targetTitle, result });
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
    const childrenId = childrenArrayId(current, targetId);

    if (childrenId === null) {
      setLastCommand({
        command: "create",
        target: domainNodeFromId(current, targetId)?.title ?? targetId,
        result: { ok: false, reason: "Selected node has no children array." },
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
    const createdId = domainNodesByTitle(after).get(title);

    if (createdId !== undefined) {
      setSelectedId(createdId);
    }

    setLastCommand({
      command: "create",
      target: domainNodeFromId(current, targetId)?.title ?? targetId,
      result,
    });
    refresh();
  }

  function reset() {
    editorRef.current = makeEditor();
    nextItemRef.current = 1;
    setClipboardValue(null);

    const rootId = editorRef.current.snapshot().rootId;

    setSelectedId(rootId);
    setLastCommand({
      command: "reset",
      target: "Command document",
      result: { ok: true },
    });
    refresh();
  }

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">zod-crud</p>
          <h1>Keyboard command showcase</h1>
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
          <aside className="panel tree-panel">
            <PanelTitle title="Document" detail={`${domainNodes.length} domain nodes`} />
            <TreeView doc={doc} nodeId={doc.rootId} selectedId={safeSelectedId} onSelect={setSelectedId} />
          </aside>

          <section className="panel preview-panel">
            <PanelTitle
              title={selectedDomain?.title ?? "No selection"}
              detail={selectedDomain === null ? "/" : selectedDomain.path}
            />
            <DocumentPreview doc={doc} selectedId={safeSelectedId} onSelect={setSelectedId} />
          </section>

          <aside className="panel detail-panel">
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
                <dd>{clipboardValue === null ? "empty" : titleFromValue(clipboardValue)}</dd>
              </div>
            </dl>

            <PanelTitle title="Flat nodes" detail={`${nodeRows.length} records`} />
            <NodeTable doc={doc} nodes={nodeRows} selectedId={safeSelectedId} onSelect={setSelectedId} />

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

function TreeView({
  doc,
  nodeId,
  selectedId,
  onSelect,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = domainNodeFromId(doc, nodeId);
  const childIds = node === null ? [] : domainChildren(doc, nodeId);

  if (node === null) {
    return null;
  }

  return (
    <ul className="tree-list">
      <li>
        <button
          type="button"
          className={selectedId === node.id ? "tree-node is-selected" : "tree-node"}
          onClick={() => onSelect(node.id)}
        >
          <span>{node.title}</span>
          <small>{node.status}</small>
        </button>
        {childIds.length === 0 ? null : (
          <div className="tree-children">
            {childIds.map((childId) => (
              <TreeView key={childId} doc={doc} nodeId={childId} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}
      </li>
    </ul>
  );
}

function DocumentPreview({
  doc,
  selectedId,
  onSelect,
}: {
  doc: JsonDoc;
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
}) {
  return (
    <div className="preview-stack">
      {toDomainNodes(doc).map((node) => (
        <button
          key={node.id}
          type="button"
          className={selectedId === node.id ? "preview-row is-selected" : "preview-row"}
          onClick={() => onSelect(node.id)}
        >
          <span>{node.title}</span>
          <span>{node.childCount} children</span>
          <strong>{node.status}</strong>
        </button>
      ))}
    </div>
  );
}

function NodeTable({
  doc,
  nodes,
  selectedId,
  onSelect,
}: {
  doc: JsonDoc;
  nodes: JsonNode[];
  selectedId: NodeId;
  onSelect: (nodeId: NodeId) => void;
}) {
  return (
    <div className="node-table" role="table" aria-label="Flat JsonDoc nodes">
      <div className="node-row node-head" role="row">
        <span>id</span>
        <span>key</span>
        <span>type</span>
      </div>
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={selectedId === node.id ? "node-row is-selected" : "node-row"}
          onClick={() => onSelect(nearestDomainNode(doc, node.id) ?? doc.rootId)}
        >
          <span>{node.id}</span>
          <span>{node.key === null ? "root" : String(node.key)}</span>
          <span>{node.type}</span>
        </button>
      ))}
    </div>
  );
}

function toDomainNodes(doc: JsonDoc): DomainNode[] {
  return Object.values(doc.nodes)
    .filter((node) => isDomainObject(doc, node))
    .map((node) => domainNodeFromId(doc, node.id))
    .filter((node): node is DomainNode => node !== null);
}

function domainNodeFromId(doc: JsonDoc, nodeId: NodeId): DomainNode | null {
  const node = doc.nodes[nodeId];

  if (node === undefined || !isDomainObject(doc, node)) {
    return null;
  }

  const title = childByKey(doc, node.id, "title")?.value;
  const status = childByKey(doc, node.id, "status")?.value;
  const children = childByKey(doc, node.id, "children");

  if (typeof title !== "string" || !isStatus(status) || children?.type !== "array") {
    return null;
  }

  return {
    id: node.id,
    title,
    status,
    childCount: children.children.length,
    path: pathString(doc, node.id),
  };
}

function domainChildren(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const childrenId = childrenArrayId(doc, nodeId);

  if (childrenId === null) {
    return [];
  }

  return doc.nodes[childrenId]?.children.filter((childId) => isDomainObject(doc, doc.nodes[childId])) ?? [];
}

function isDomainObject(doc: JsonDoc, node: JsonNode | undefined): boolean {
  return node?.type === "object" &&
    childByKey(doc, node.id, "title")?.type === "string" &&
    childByKey(doc, node.id, "status")?.type === "string" &&
    childByKey(doc, node.id, "children")?.type === "array";
}

function childrenArrayId(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const child = childByKey(doc, nodeId, "children");

  return child?.type === "array" ? child.id : null;
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
    const next = nearestDomainNode(after, candidate);

    if (next !== null) {
      return next;
    }
  }

  return after.rootId;
}

function nearestDomainNode(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  let current = doc.nodes[nodeId];

  while (current !== undefined) {
    if (isDomainObject(doc, current)) {
      return current.id;
    }

    current = current.parentId === null ? undefined : doc.nodes[current.parentId];
  }

  return null;
}

function keepSelectionOrRoot(doc: JsonDoc, nodeId: NodeId): NodeId {
  return nearestDomainNode(doc, nodeId) ?? doc.rootId;
}

function domainNodesByTitle(doc: JsonDoc): Map<string, NodeId> {
  const nodes = new Map<string, NodeId>();

  for (const node of toDomainNodes(doc)) {
    nodes.set(node.title, node.id);
  }

  return nodes;
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

function titleFromValue(value: JsonValue): string {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const title = value.title;

    if (typeof title === "string") {
      return title;
    }
  }

  return JSON.stringify(value);
}

function isStatus(value: JsonValue | undefined): value is CommandNode["status"] {
  return value === "draft" || value === "active" || value === "done";
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
