import {
  Bell,
  Braces,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Database,
  FileCode2,
  History,
  LayoutTemplate,
  Layers,
  MousePointer2,
  Move,
  Pencil,
  Plus,
  Redo2,
  RefreshCcw,
  Search,
  Scissors,
  SendHorizontal,
  SlidersHorizontal,
  Smartphone,
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
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createJsonCrud,
  deserialize,
  type JsonDoc,
  type JsonNode,
  type JsonValue,
  type NodeId,
  type OperationResult,
} from "zod-crud";

import {
  DesignNodeSchema,
  initialDesignJson,
  type DesignIconName,
  type UiNode,
} from "./design-schema.js";
import "./styles.css";

type ComponentBinding = {
  component: string;
  field: string;
  schema: string;
  operation: string;
  state: string;
  validation: string;
};

type SelectedComponentBinding = ComponentBinding & {
  nodeId: NodeId | "none";
};

const CRUD_BINDINGS: Record<string, ComponentBinding> = {
  ZodCrudBuilder: {
    component: "Builder document",
    field: "$root",
    schema: "UiBuilderSchema",
    operation: "deserialize + snapshot",
    state: "synced",
    validation: "Every canvas edit is checked against the Zod schema.",
  },
  MobileRecordScreen: {
    component: "Mobile app screen",
    field: "salesOrder",
    schema: "SalesOrderSchema",
    operation: "create + read",
    state: "ready",
    validation: "Object-level guard before the screen is persisted.",
  },
  AppToolbar: {
    component: "Top toolbar",
    field: "meta.updatedAt",
    schema: "z.coerce.date()",
    operation: "read",
    state: "live",
    validation: "Shows the latest valid snapshot timestamp.",
  },
  SchemaStatusCard: {
    component: "Schema status card",
    field: "$validation",
    schema: "safeParse(result)",
    operation: "read",
    state: "valid",
    validation: "Displays parser output and CRUD availability.",
  },
  MarketHeroImage: {
    component: "Hero image",
    field: "media.hero.src",
    schema: "z.string().url()",
    operation: "read + update",
    state: "loaded",
    validation: "The image URL is part of the validated zod-crud document.",
  },
  CustomerNameField: {
    component: "Text input",
    field: "customer.name",
    schema: "z.string().min(2)",
    operation: "create + update",
    state: "dirty",
    validation: "Required field, validates on blur and before save.",
  },
  OrderStatusField: {
    component: "Status select",
    field: "status",
    schema: "z.enum(['draft', 'paid', 'sent'])",
    operation: "update",
    state: "draft",
    validation: "Enum values drive the segmented status control.",
  },
  LineItemsList: {
    component: "Repeater list",
    field: "lineItems[]",
    schema: "z.array(LineItemSchema).min(1)",
    operation: "create + delete",
    state: "2 rows",
    validation: "Each list row is a child node in the zod-crud document.",
  },
  OrganicBundleImage: {
    component: "Line item image",
    field: "lineItems[0].image",
    schema: "z.string().url()",
    operation: "read + update",
    state: "loaded",
    validation: "Product thumbnails can be treated as editable media fields.",
  },
  ColdChainImage: {
    component: "Line item image",
    field: "lineItems[1].image",
    schema: "z.string().url()",
    operation: "read + update",
    state: "loaded",
    validation: "Product thumbnails can be treated as editable media fields.",
  },
  SaveButton: {
    component: "Primary action",
    field: "$commit",
    schema: "SalesOrderSchema.safeParse",
    operation: "update + serialize",
    state: "enabled",
    validation: "Disabled until the current snapshot is parse-safe.",
  },
  PropertyPanel: {
    component: "Inspector panel",
    field: "$selection",
    schema: "NodeSelectionSchema",
    operation: "read + update",
    state: "selected",
    validation: "Selection metadata comes from the zod-crud node graph.",
  },
};

type LogEntry = {
  id: number;
  label: string;
  ok: boolean;
  reason?: string;
};

function makeEditor() {
  return createJsonCrud(DesignNodeSchema, initialDesignJson);
}

function App() {
  const editorRef = useRef(makeEditor());
  const nextLogIdRef = useRef(2);
  const initialRootId = editorRef.current.snapshot().rootId;
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<NodeId>(initialRootId);
  const [focusedIds, setFocusedIds] = useState<NodeId[]>([initialRootId]);
  const [clipboardJson, setClipboardJson] = useState<string>("");
  const [clipboardValue, setClipboardValue] = useState<JsonValue | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, label: "load initial JSON", ok: true },
  ]);

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const json = useMemo(() => editorRef.current.toJson(), [version]);
  const selectedNode = doc.nodes[selectedId] ?? doc.nodes[doc.rootId];
  const selectedBinding = useMemo(() => selectedComponentBinding(doc, selectedId), [doc, selectedId]);
  const focusedSet = useMemo(() => new Set(focusedIds.filter((id) => doc.nodes[id] !== undefined)), [doc, focusedIds]);
  const selectionBridge = useMemo(
    () => createSelectionBridge(doc, selectedId, focusedSet),
    [doc, focusedSet, selectedId],
  );

  useEffect(() => {
    const recovered = recoverFocus(doc, focusedIds, selectedId);

    if (selectedId !== recovered.selectedId) {
      setSelectedId(recovered.selectedId);
    }

    if (!sameIds(focusedIds, recovered.focusedIds)) {
      setFocusedIds(recovered.focusedIds);
    }
  }, [doc, focusedIds, selectedId]);

  const selectedPasteStatus = useMemo(() => {
    if (clipboardValue === null) {
      return undefined;
    }

    const contentPasteTargetId = contentPasteTargetNodeId(doc, selectedId, clipboardValue);

    if (contentPasteTargetId !== null) {
      return { ok: true };
    }

    return editorRef.current.canPaste(selectedId);
  }, [clipboardValue, doc, selectedId]);
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
    setClipboardValue(value);
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
          setClipboardValue(value);
          setClipboardJson(JSON.stringify(value, null, 2));
        }

        return result;
      },
      (before, after) => deletionFocusIds(before, after, targetId),
    );
  }

  function pasteSelected() {
    const contentTargetId = clipboardValue === null ? null : contentPasteTargetNodeId(doc, selectedId, clipboardValue);

    run(
      `paste into ${selectedId}`,
      () => {
        if (clipboardValue !== null && contentTargetId !== null) {
          const contentResult = pasteContentOnly(editorRef.current, doc, selectedId, clipboardValue);

          if (contentResult.ok) {
            return contentResult;
          }
        }

        return editorRef.current.paste(selectedId);
      },
      contentTargetId === null ? undefined : () => [selectedId],
    );
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
        name: `Text${arrayNode.children.length + 1}`,
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
        name: `Box${arrayNode.children.length + 1}`,
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
    setClipboardValue(null);
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
            <p>Spatial schema editor</p>
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
            selectedId={selectionBridge.selectedLayerId}
            focusedSet={selectionBridge.focusedLayerIds}
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
              <MobileBuilderCanvas
                doc={doc}
                selectedId={selectedId}
                selectedPreviewId={selectionBridge.selectedPreviewId}
                focusedSet={selectionBridge.focusedPreviewIds}
                onSelect={selectNode}
              />
            </div>
          </div>
        </section>

        <aside className="panel inspector control-panel">
          <PanelTitle icon={<SlidersHorizontal />} title="Inspector" />
          <div className="control-panel-body">
            <section className="control-section selection-panel">
              <ComponentBindingPanel binding={selectedBinding} />
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

            <section className="control-section">
              <SectionTitle icon={<Table2 />} title="Nodes" />
              <NodeTable
                doc={doc}
                selectedId={selectedId}
                focusedSet={focusedSet}
                onSelect={selectNode}
              />
            </section>

            <section className="control-section split-section">
              <div>
                <SectionTitle icon={<Braces />} title="JSON" />
                <pre className="json-view">{JSON.stringify(json, null, 2)}</pre>
              </div>
              <div>
                <SectionTitle icon={<Clipboard />} title="Clipboard" />
                <pre className="json-view clipboard-view">{clipboardJson || "empty"}</pre>
              </div>
            </section>

            <section className="control-section">
              <SectionTitle icon={<History />} title="Timeline" />
              <ul className="log-list">
                {logs.map((entry) => (
                  <li key={entry.id} className={entry.ok ? "ok" : "fail"}>
                    <span>{entry.label}</span>
                    <small>{entry.ok ? "ok" : entry.reason}</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>
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

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <h3>{title}</h3>
    </div>
  );
}

function TreeView({
  doc,
  nodeId,
  selectedId,
  focusedSet,
  onSelect,
  depth = 0,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
  depth?: number;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  const childIds = visibleTreeChildIds(doc, nodeId);

  return (
    <ul className="tree-list">
      <li>
        <button
          type="button"
          className={nodeClass("tree-item", nodeId, selectedId, focusedSet)}
          data-node-id={nodeId}
          data-selected={nodeId === selectedId ? "true" : undefined}
          aria-selected={nodeId === selectedId}
          style={{ "--depth": depth } as CSSProperties}
          onClick={() => onSelect(nodeId)}
          title={`${nodeLabel(doc, node)} · ${node.id}`}
        >
          <span>{treeDisplayLabel(doc, node)}</span>
          <small>{treeDisplayMeta(doc, node)}</small>
        </button>
        {childIds.length > 0 ? (
          <div className="tree-children">
            {childIds.map((childId) => (
              <TreeView
                key={childId}
                doc={doc}
                nodeId={childId}
                selectedId={selectedId}
                focusedSet={focusedSet}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </li>
    </ul>
  );
}

function visibleTreeChildIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return [];
  }

  return node.children.flatMap((childId) => {
    const child = doc.nodes[childId];

    if (child === undefined) {
      return [];
    }

    if (isLayerNode(doc, child)) {
      return [child.id];
    }

    return visibleTreeChildIds(doc, child.id);
  });
}

function isLayerNode(doc: JsonDoc, node: JsonNode) {
  return node.id === doc.rootId || (node.type === "object" && primitiveField(doc, node.id, "kind") !== null);
}

function treeSelectionId(doc: JsonDoc, nodeId: NodeId): NodeId {
  let current = doc.nodes[nodeId] ?? doc.nodes[doc.rootId];

  while (current !== undefined) {
    if (isLayerNode(doc, current)) {
      return current.id;
    }

    if (current.parentId === null) {
      break;
    }

    current = doc.nodes[current.parentId];
  }

  return doc.rootId;
}

function createSelectionBridge(doc: JsonDoc, selectedId: NodeId, focusedSet: Set<NodeId>) {
  const selectedLayerId = treeSelectionId(doc, selectedId);
  const selectedPreviewId = previewSelectionId(doc, selectedId);

  return {
    selectedLayerId,
    selectedPreviewId,
    focusedLayerIds: mapSelectionSet(doc, focusedSet, treeSelectionId, selectedLayerId),
    focusedPreviewIds: mapSelectionSet(doc, focusedSet, previewSelectionId, selectedPreviewId),
  };
}

function previewSelectionId(doc: JsonDoc, nodeId: NodeId): NodeId {
  return visibleObjectNodeForSelection(doc, nodeId)?.id ?? (doc.nodes[nodeId] === undefined ? doc.rootId : nodeId);
}

function mapSelectionSet(
  doc: JsonDoc,
  focusedSet: Set<NodeId>,
  normalize: (doc: JsonDoc, nodeId: NodeId) => NodeId,
  selectedId: NodeId,
) {
  const mapped = new Set<NodeId>([selectedId]);

  for (const id of focusedSet) {
    if (doc.nodes[id] !== undefined) {
      mapped.add(normalize(doc, id));
    }
  }

  return mapped;
}

function treeDisplayLabel(doc: JsonDoc, node: JsonNode) {
  if (node.type === "object") {
    return (
      primitiveField(doc, node.id, "name") ??
      primitiveField(doc, node.id, "label") ??
      primitiveField(doc, node.id, "text") ??
      primitiveField(doc, node.id, "kind") ??
      "object"
    );
  }

  if (node.type === "array") {
    return node.key === null ? "array" : `${String(node.key)}[]`;
  }

  const key = node.key === null ? "value" : String(node.key);
  return `${key}: ${String(node.value)}`;
}

function treeDisplayMeta(doc: JsonDoc, node: JsonNode) {
  if (node.type === "object") {
    return primitiveField(doc, node.id, "kind") ?? "object";
  }

  if (node.type === "array") {
    return `${node.children.length}`;
  }

  return node.type;
}

function MobileBuilderCanvas({
  doc,
  selectedId,
  selectedPreviewId,
  focusedSet,
  onSelect,
}: {
  doc: JsonDoc;
  selectedId: NodeId;
  selectedPreviewId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const binding = selectedComponentBinding(doc, selectedId);
  const rootSlotIds = designSlotIds(doc, doc.rootId);
  const mobileScreenId =
    designSlotId(doc, doc.rootId, "screen") ??
    rootSlotIds.find((childId) => primitiveField(doc, childId, "name") === "MobileRecordScreen") ??
    null;
  const sideChildIds = rootSlotIds.filter((childId) => childId !== mobileScreenId);

  return (
    <SelectablePreview
      nodeId={doc.rootId}
      selectedPreviewId={selectedPreviewId}
      focusedSet={focusedSet}
      onSelect={onSelect}
      className="builder-preview-grid"
      label="ZodCrudBuilder"
    >
      <section className="device-workbench" aria-label="Mobile application screen mockup">
        <div className="device-caption">
          <Smartphone />
          <span>record surface</span>
        </div>
        {mobileScreenId === null ? null : (
          <DesignPreviewNode
            doc={doc}
            nodeId={mobileScreenId}
            selectedPreviewId={selectedPreviewId}
            focusedSet={focusedSet}
            onSelect={onSelect}
          />
        )}
      </section>

      <aside className="canvas-binding-panel" aria-label="Selected binding summary">
        <div className="binding-panel-header">
          <FileCode2 />
          <div>
            <span>Selected binding</span>
            <strong>{binding.component}</strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>CRUD field</dt>
            <dd>{binding.field}</dd>
          </div>
          <div>
            <dt>Zod schema</dt>
            <dd>{binding.schema}</dd>
          </div>
          <div>
            <dt>Operation</dt>
            <dd>{binding.operation}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{binding.state}</dd>
          </div>
        </dl>
        {sideChildIds.length === 0 ? null : (
          <div className="root-side-nodes">
            {sideChildIds.map((childId) => (
              <DesignPreviewNode
                key={childId}
                doc={doc}
                nodeId={childId}
                selectedPreviewId={selectedPreviewId}
                focusedSet={focusedSet}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </aside>
    </SelectablePreview>
  );
}

function DesignPreviewNode({
  doc,
  nodeId,
  selectedPreviewId,
  focusedSet,
  onSelect,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedPreviewId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  const value = deserialize(doc, nodeId);

  if (isUiGroup(value)) {
    if (value.name === "MobileRecordScreen") {
      return (
        <SelectablePreview
          nodeId={nodeId}
          selectedPreviewId={selectedPreviewId}
          focusedSet={focusedSet}
          onSelect={onSelect}
          className="phone-device"
          label={value.name}
        >
          <div className="phone-hardware">
            <div className="phone-speaker" aria-hidden="true" />
            <div className="mobile-app-screen">
              <div className="mobile-statusbar">
                <span>9:41</span>
                <div aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              {designEntityChildIds(doc, nodeId).map((childId) => (
                <DesignPreviewNode
                  key={childId}
                  doc={doc}
                  nodeId={childId}
                  selectedPreviewId={selectedPreviewId}
                  focusedSet={focusedSet}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </SelectablePreview>
      );
    }

    return (
      <SelectablePreview
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewContainerClass(value)}
        label={value.name}
      >
        {designEntityChildIds(doc, nodeId).map((childId) => (
          <DesignPreviewNode
            key={childId}
            doc={doc}
            nodeId={childId}
            selectedPreviewId={selectedPreviewId}
            focusedSet={focusedSet}
            onSelect={onSelect}
          />
        ))}
      </SelectablePreview>
    );
  }

  if (isUiFrame(value)) {
    if (value.name === "MobileRecordScreen") {
      return (
        <SelectablePreview
          nodeId={nodeId}
          selectedPreviewId={selectedPreviewId}
          focusedSet={focusedSet}
          onSelect={onSelect}
          className="phone-device"
          label={value.name}
        >
          <div className="phone-hardware">
            <div className="phone-speaker" aria-hidden="true" />
            <div className="mobile-app-screen">
              <div className="mobile-statusbar">
                <span>9:41</span>
                <div aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              {designChildIds(doc, nodeId).map((childId) => (
                <DesignPreviewNode
                  key={childId}
                  doc={doc}
                  nodeId={childId}
                  selectedPreviewId={selectedPreviewId}
                  focusedSet={focusedSet}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </SelectablePreview>
      );
    }

    return (
      <SelectablePreview
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewContainerClass(value)}
        label={value.name}
      >
        {designChildIds(doc, nodeId).map((childId) => (
          <DesignPreviewNode
            key={childId}
            doc={doc}
            nodeId={childId}
            selectedPreviewId={selectedPreviewId}
            focusedSet={focusedSet}
            onSelect={onSelect}
          />
        ))}
      </SelectablePreview>
    );
  }

  if (isUiFlex(value)) {
    return (
      <SelectablePreview
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewContainerClass(value)}
        label={value.name}
        style={{ gap: value.gap }}
      >
        {designChildIds(doc, nodeId).map((childId) => (
          <DesignPreviewNode
            key={childId}
            doc={doc}
            nodeId={childId}
            selectedPreviewId={selectedPreviewId}
            focusedSet={focusedSet}
            onSelect={onSelect}
          />
        ))}
      </SelectablePreview>
    );
  }

  if (isUiText(value)) {
    return (
      <SelectableInline
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewTextClass(value)}
        label={value.name}
      >
        {value.text}
      </SelectableInline>
    );
  }

  if (isUiRect(value)) {
    return (
      <SelectableInline
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewRectClass(value)}
        label={value.name}
      >
        {value.label}
      </SelectableInline>
    );
  }

  if (isUiIcon(value)) {
    return (
      <SelectableInline
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewIconClass(value)}
        label={value.name}
      >
        <IconGlyph icon={value.icon} />
      </SelectableInline>
    );
  }

  if (isUiImage(value)) {
    return (
      <SelectablePreview
        nodeId={nodeId}
        selectedPreviewId={selectedPreviewId}
        focusedSet={focusedSet}
        onSelect={onSelect}
        className={previewImageClass(value)}
        label={value.name}
      >
        <img className={value.aspect === "thumb" ? "line-item-thumb" : undefined} src={value.src} alt={value.alt} />
      </SelectablePreview>
    );
  }

  return null;
}

function designChildIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const childrenArrayId = childIdByKey(doc, nodeId, "children");
  const children = childrenArrayId === null ? undefined : doc.nodes[childrenArrayId];

  return children?.type === "array" ? children.children : [];
}

function designEntityChildIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const slotIds = designSlotIds(doc, nodeId);
  const collectionIds = designCollectionItemIds(doc, nodeId);

  return [...slotIds, ...collectionIds];
}

function designSlotIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const slotsId = childIdByKey(doc, nodeId, "slots");
  const slots = slotsId === null ? undefined : doc.nodes[slotsId];

  return slots?.type === "object" ? slots.children : [];
}

function designSlotId(doc: JsonDoc, nodeId: NodeId, slotName: string): NodeId | null {
  const slotsId = childIdByKey(doc, nodeId, "slots");

  if (slotsId === null) {
    return null;
  }

  return childIdByKey(doc, slotsId, slotName);
}

function designCollectionItemIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const collectionsId = childIdByKey(doc, nodeId, "collections");
  const collections = collectionsId === null ? undefined : doc.nodes[collectionsId];

  if (collections?.type !== "object") {
    return [];
  }

  return collections.children.flatMap((collectionId) => {
    const collection = doc.nodes[collectionId];
    return collection?.type === "array" ? collection.children : [];
  });
}

function previewContainerClass(value: Extract<UiNode, { kind: "group" | "frame" | "flex" }>) {
  const knownClass = PREVIEW_CONTAINER_CLASSES[value.name];

  if (knownClass !== undefined) {
    return knownClass;
  }

  if (value.kind === "flex") {
    return `preview-flex preview-flex-${value.direction} ${previewNameClass(value.name)}`;
  }

  return `preview-frame ${previewNameClass(value.name)}`;
}

function previewTextClass(value: Extract<UiNode, { kind: "text" }>) {
  return PREVIEW_TEXT_CLASSES[value.name] ?? `preview-text tone-${value.tone} ${previewNameClass(value.name)}`;
}

function previewRectClass(value: Extract<UiNode, { kind: "rect" }>) {
  return PREVIEW_RECT_CLASSES[value.name] ?? `preview-rect fill-${value.fill} ${previewNameClass(value.name)}`;
}

function previewIconClass(value: Extract<UiNode, { kind: "icon" }>) {
  return PREVIEW_ICON_CLASSES[value.name] ?? `preview-icon tone-${value.tone} ${previewNameClass(value.name)}`;
}

function previewImageClass(value: Extract<UiNode, { kind: "image" }>) {
  return PREVIEW_IMAGE_CLASSES[value.name] ?? `preview-image-frame preview-image-${value.aspect} ${previewNameClass(value.name)}`;
}

function previewNameClass(name: string) {
  return `preview-name-${name.replace(/[A-Z]/g, (letter, index) => `${index === 0 ? "" : "-"}${letter.toLowerCase()}`).replace(/[^a-z0-9]+/g, "-")}`;
}

const PREVIEW_CONTAINER_CLASSES: Record<string, string> = {
  AppToolbar: "mobile-app-toolbar",
  BottomNavFlex: "mobile-bottom-nav",
  ColdChainLineItemCopyFlex: "line-item-copy",
  ColdChainLineItemFlex: "line-item-row",
  CrudModeTabs: "mobile-segmented",
  CustomerHeadingFlex: "field-heading",
  CustomerInputFlex: "input-control",
  CustomerNameField: "field-card hero-field",
  HeroCard: "visual-hero-card",
  HeroOverlayFlex: "visual-hero-overlay",
  LineItemsHeadingCopyFlex: "list-heading-copy",
  LineItemsHeadingFlex: "list-heading",
  LineItemsList: "line-items-panel",
  OrderStatusField: "field-card status-field",
  OrganicLineItemCopyFlex: "line-item-copy",
  OrganicLineItemFlex: "line-item-row",
  PropertyPanel: "side-property-panel",
  SaveButton: "mobile-primary-action",
  SchemaCopyFlex: "schema-copy-stack",
  SchemaStatusCard: "schema-health-card",
  StatusHeadingFlex: "field-heading",
  StatusPillsFlex: "status-pills",
  ToolbarActionsFlex: "mobile-toolbar-actions",
  ToolbarTitleFlex: "toolbar-title-stack",
};

const PREVIEW_TEXT_CLASSES: Record<string, string> = {
  ColdChainMetaText: "line-item-meta",
  ColdChainTitleText: "line-item-title",
  CreateModeText: "mode-segment active",
  CustomerFieldPathText: "field-path",
  CustomerLabelText: "field-title",
  CustomerSchemaText: "schema-inline",
  CustomerValueText: "input-value",
  DraftStatusText: "status-pill active",
  HeroMediaFieldText: "hero-field-label",
  HeroTitleText: "hero-title",
  HydratedFieldsText: "schema-detail",
  LineItemsPathText: "list-path",
  LineItemsTitleText: "list-title",
  OrganicBundleMetaText: "line-item-meta",
  OrganicBundleTitleText: "line-item-title",
  PaidStatusText: "status-pill",
  ReadModeText: "mode-segment",
  SaveButtonText: "save-button-text",
  SchemaNameText: "schema-name",
  SelectedComponentText: "side-property-text",
  SentStatusText: "status-pill",
  SnapshotStatusText: "schema-status",
  StatusFieldPathText: "field-path",
  StatusLabelText: "field-title",
  ToolbarEyebrowText: "toolbar-eyebrow",
  ToolbarTitleText: "toolbar-title",
  UpdateModeText: "mode-segment",
};

const PREVIEW_RECT_CLASSES: Record<string, string> = {
  ColdChainStatusBadge: "line-item-badge",
  CrudFieldBindingControl: "side-property-control",
  LineItemsRepeater: "repeater-block",
  OrganicStatusBadge: "line-item-badge",
  SafeParseBadge: "safeparse-badge",
  SyncStatus: "sync-status-badge",
};

const PREVIEW_ICON_CLASSES: Record<string, string> = {
  AddLineItemIcon: "add-row",
  CustomerSelectIcon: "input-icon",
  DatabaseTabIcon: "bottom-nav-button",
  HistoryTabIcon: "bottom-nav-button",
  LayoutTabIcon: "bottom-nav-button active",
  NotificationIcon: "toolbar-action-button",
  SaveButtonIcon: "save-button-icon",
  SchemaValidIcon: "health-icon",
  SearchIcon: "toolbar-action-button",
};

const PREVIEW_IMAGE_CLASSES: Record<string, string> = {
  ColdChainImage: "line-item-thumb-frame",
  MarketHeroImage: "visual-hero-image",
  OrganicBundleImage: "line-item-thumb-frame",
};

function SelectablePreview({
  nodeId,
  selectedPreviewId,
  focusedSet,
  onSelect,
  className,
  label,
  style,
  children,
}: {
  nodeId: NodeId | null;
  selectedPreviewId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
  className: string;
  label: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const classes = previewNodeClass(className, nodeId, selectedPreviewId, focusedSet);

  return (
    <div
      className={classes}
      data-node-id={nodeId ?? undefined}
      data-node-label={label}
      data-selected={nodeId === selectedPreviewId ? "true" : undefined}
      role="button"
      aria-label={label}
      aria-pressed={nodeId === selectedPreviewId}
      tabIndex={nodeId === null ? -1 : 0}
      style={style}
      onClick={(event) => {
        if (nodeId === null) {
          return;
        }

        event.stopPropagation();
        onSelect(nodeId);
      }}
      onKeyDown={(event) => {
        if (nodeId !== null) {
          selectNodeFromKeyboard(event, nodeId, onSelect);
        }
      }}
    >
      {children}
    </div>
  );
}

function SelectableInline({
  nodeId,
  selectedPreviewId,
  focusedSet,
  onSelect,
  className,
  label,
  children,
}: {
  nodeId: NodeId | null;
  selectedPreviewId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const classes = previewNodeClass(className, nodeId, selectedPreviewId, focusedSet);

  return (
    <span
      className={classes}
      data-node-id={nodeId ?? undefined}
      data-node-label={label}
      data-selected={nodeId === selectedPreviewId ? "true" : undefined}
      role="button"
      aria-label={label}
      aria-pressed={nodeId === selectedPreviewId}
      tabIndex={nodeId === null ? -1 : 0}
      onClick={(event) => {
        if (nodeId === null) {
          return;
        }

        event.stopPropagation();
        onSelect(nodeId);
      }}
      onKeyDown={(event) => {
        if (nodeId !== null) {
          selectNodeFromKeyboard(event, nodeId, onSelect);
        }
      }}
    >
      {children}
    </span>
  );
}

function ComponentBindingPanel({ binding }: { binding: SelectedComponentBinding }) {
  return (
    <div className="component-binding-card">
      <div className="binding-eyebrow">
        <LayoutTemplate />
        <span>Selected component</span>
      </div>
      <div className="binding-heading">
        <strong>{binding.component}</strong>
        <code>{binding.nodeId}</code>
      </div>
      <div className="binding-form">
        <label>
          <span>CRUD field</span>
          <input value={binding.field} readOnly />
        </label>
        <label>
          <span>Zod schema</span>
          <input value={binding.schema} readOnly />
        </label>
        <label>
          <span>Operation</span>
          <input value={binding.operation} readOnly />
        </label>
        <label>
          <span>State</span>
          <input value={binding.state} readOnly />
        </label>
      </div>
      <div className="binding-validation">
        <CheckCircle2 />
        <span>{binding.validation}</span>
      </div>
    </div>
  );
}

function CanvasNode({
  doc,
  nodeId,
  selectedId,
  focusedSet,
  onSelect,
}: {
  doc: JsonDoc;
  nodeId: NodeId;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
  onSelect: (nodeId: NodeId) => void;
}) {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  const value = deserialize(doc, nodeId);
  const className = nodeClass("canvas-node", nodeId, selectedId, focusedSet);

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
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isUiFlex(value)) {
    const childrenArrayId = childIdByKey(doc, nodeId, "children");
    const childIds = childrenArrayId ? doc.nodes[childrenArrayId]?.children ?? [] : [];

    return (
      <div
        className={`${className} flex-node flex-${value.direction}`}
        style={{ gap: value.gap }}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      >
        {childIds.map((childId) => (
          <CanvasNode
            key={childId}
            doc={doc}
            nodeId={childId}
            selectedId={selectedId}
            focusedSet={focusedSet}
            onSelect={onSelect}
          />
        ))}
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

  if (isUiImage(value)) {
    return (
      <img
        className={`${className} image-node image-${value.aspect}`}
        src={value.src}
        alt={value.alt}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      />
    );
  }

  if (isUiIcon(value)) {
    return (
      <div
        className={`${className} icon-node tone-${value.tone}`}
        role="button"
        tabIndex={0}
        title={value.label}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(nodeId);
        }}
        onKeyDown={(event) => selectNodeFromKeyboard(event, nodeId, onSelect)}
      >
        <IconGlyph icon={value.icon} />
      </div>
    );
  }

  return (
    <button type="button" className={`${className} leaf-node`} onClick={() => onSelect(nodeId)}>
      {nodeLabel(doc, node)}
    </button>
  );
}

function IconGlyph({ icon }: { icon: DesignIconName }) {
  switch (icon) {
    case "search":
      return <Search />;
    case "bell":
      return <Bell />;
    case "check-circle":
      return <CheckCircle2 />;
    case "chevron-down":
      return <ChevronDown />;
    case "plus":
      return <Plus />;
    case "send":
      return <SendHorizontal />;
    case "layout-template":
      return <LayoutTemplate />;
    case "database":
      return <Database />;
    case "history":
      return <History />;
  }
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
  onSelect,
}: {
  doc: JsonDoc;
  selectedId: NodeId;
  focusedSet: Set<NodeId>;
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
              className={nodeClass("", node.id, selectedId, focusedSet)}
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
) {
  const classes = [base];

  if (focusedSet.has(nodeId)) {
    classes.push("focused");
  }

  if (nodeId === selectedId) {
    classes.push("selected");
  }

  return classes.filter(Boolean).join(" ");
}

function previewNodeClass(
  base: string,
  nodeId: NodeId | null,
  selectedPreviewId: NodeId,
  focusedSet: Set<NodeId>,
) {
  const classes = [base, "preview-selectable"];

  if (nodeId !== null && focusedSet.has(nodeId)) {
    classes.push("focused");
  }

  if (nodeId !== null && nodeId === selectedPreviewId) {
    classes.push("selected");
  }

  return classes.join(" ");
}

function selectedComponentBinding(doc: JsonDoc, selectedId: NodeId): SelectedComponentBinding {
  const sourceNode = visibleObjectNodeForSelection(doc, selectedId) ?? doc.nodes[selectedId] ?? doc.nodes[doc.rootId];

  if (sourceNode === undefined) {
    return {
      nodeId: "none",
      component: "No selection",
      field: "$selection",
      schema: "unknown",
      operation: "read",
      state: "empty",
      validation: "No zod-crud node is selected.",
    };
  }

  const sourceKey =
    primitiveField(doc, sourceNode.id, "name") ??
    primitiveField(doc, sourceNode.id, "label") ??
    primitiveField(doc, sourceNode.id, "text") ??
    String(sourceNode.value ?? sourceNode.type);
  const binding = CRUD_BINDINGS[sourceKey] ?? fallbackBinding(doc, sourceNode);

  return {
    ...binding,
    nodeId: sourceNode.id,
  };
}

function fallbackBinding(doc: JsonDoc, node: JsonNode): ComponentBinding {
  const key = node.key === null ? "$root" : String(node.key);
  const kind = primitiveField(doc, node.id, "kind") ?? node.type;

  return {
    component: node.type === "object" ? `${kind} component` : `${node.type} node`,
    field: key,
    schema: schemaLabelForNode(node),
    operation: node.children.length > 0 ? "read" : "update",
    state: node.id === doc.rootId ? "root" : "selected",
    validation: "Assign a CRUD binding to turn this node into an editable field.",
  };
}

function schemaLabelForNode(node: JsonNode) {
  if (node.type === "object") {
    return "z.object(...)";
  }

  if (node.type === "array") {
    return "z.array(...)";
  }

  if (node.type === "string") {
    return "z.string()";
  }

  if (node.type === "number") {
    return "z.number()";
  }

  if (node.type === "boolean") {
    return "z.boolean()";
  }

  return "z.unknown()";
}

function visibleObjectNodeForSelection(doc: JsonDoc, nodeId: NodeId): JsonNode | null {
  let current = doc.nodes[nodeId] ?? null;

  while (current !== null) {
    if (current.type === "object") {
      return current;
    }

    if (current.parentId === null) {
      return null;
    }

    current = doc.nodes[current.parentId] ?? null;
  }

  return null;
}

function nodeLabel(doc: JsonDoc, node: JsonNode) {
  const key = node.key === null ? "$" : String(node.key);

  if (node.type === "object") {
    const kind = primitiveField(doc, node.id, "kind");
    const displayName =
      primitiveField(doc, node.id, "name") ??
      primitiveField(doc, node.id, "label") ??
      primitiveField(doc, node.id, "text");

    if (kind !== null && displayName !== null) {
      return `${key}: ${displayName}`;
    }

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
    if (children?.type === "array") {
      return children.id;
    }

    return firstCollectionArrayId(doc, nodeId);
  }

  return null;
}

function firstCollectionArrayId(doc: JsonDoc, nodeId: NodeId): NodeId | null {
  const collectionsId = childIdByKey(doc, nodeId, "collections");
  const collections = collectionsId === null ? undefined : doc.nodes[collectionsId];

  if (collections?.type !== "object") {
    return null;
  }

  return collections.children.find((childId) => doc.nodes[childId]?.type === "array") ?? null;
}

function pasteContentOnly(
  editor: ReturnType<typeof makeEditor>,
  doc: JsonDoc,
  selectedId: NodeId,
  clipboardValue: JsonValue,
): OperationResult {
  const content = copiedContentValue(clipboardValue);

  if (content === null) {
    return { ok: false, reason: "Clipboard has no pasteable content field." };
  }

  const targetId = contentPasteTargetNodeId(doc, selectedId, clipboardValue);

  if (targetId === null) {
    return { ok: false, reason: "Selected node has no compatible content field." };
  }

  return editor.update(targetId, content.value);
}

function contentPasteTargetNodeId(doc: JsonDoc, selectedId: NodeId, clipboardValue: JsonValue): NodeId | null {
  const content = copiedContentValue(clipboardValue);

  if (content === null) {
    return null;
  }

  return firstContentTargetNodeId(doc, selectedId, content);
}

function firstContentTargetNodeId(
  doc: JsonDoc,
  nodeId: NodeId,
  content: { kind: string | null; value: string },
): NodeId | null {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return null;
  }

  if (node.type === "string" && contentPrimitiveKeyAccepts(node.key, content.kind)) {
    return node.id;
  }

  if (node.type !== "object") {
    return null;
  }

  const kind = primitiveField(doc, node.id, "kind");
  const directKey = contentFieldKeyForTargetKind(kind, content.kind);

  if (directKey !== null) {
    const directId = childIdByKey(doc, node.id, directKey);
    const directNode = directId === null ? undefined : doc.nodes[directId];

    if (directNode?.type === "string") {
      return directNode.id;
    }
  }

  for (const childId of designContentChildIds(doc, node.id)) {
    const targetId = firstContentTargetNodeId(doc, childId, content);

    if (targetId !== null) {
      return targetId;
    }
  }

  return null;
}

function copiedContentValue(value: JsonValue): { kind: string | null; value: string } | null {
  if (typeof value === "string") {
    return { kind: null, value };
  }

  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }

  if (value.kind === "text" && typeof value.text === "string") {
    return { kind: "text", value: value.text };
  }

  if ((value.kind === "rect" || value.kind === "icon") && typeof value.label === "string") {
    return { kind: value.kind, value: value.label };
  }

  if (value.kind === "image" && typeof value.src === "string") {
    return { kind: "image", value: value.src };
  }

  return null;
}

function contentPrimitiveKeyAccepts(key: string | number | null, sourceKind: string | null) {
  if (key === "text" || key === "label") {
    return sourceKind !== "image";
  }

  return key === "src" && sourceKind === "image";
}

function contentFieldKeyForTargetKind(targetKind: string | null, sourceKind: string | null) {
  if (targetKind === "text") {
    return sourceKind === "image" ? null : "text";
  }

  if (targetKind === "rect" || targetKind === "icon") {
    return sourceKind === "image" ? null : "label";
  }

  if (targetKind === "image") {
    return sourceKind === "image" ? "src" : null;
  }

  return null;
}

function designContentChildIds(doc: JsonDoc, nodeId: NodeId): NodeId[] {
  const node = doc.nodes[nodeId];

  if (node === undefined) {
    return [];
  }

  if (primitiveField(doc, nodeId, "kind") === "group") {
    return designEntityChildIds(doc, nodeId);
  }

  return designChildIds(doc, nodeId);
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

function isUiGroup(value: JsonValue): value is Extract<UiNode, { kind: "group" }> {
  return (
    isRecord(value) &&
    value.kind === "group" &&
    typeof value.role === "string" &&
    value.slots !== undefined &&
    value.collections !== undefined &&
    isRecord(value.slots) &&
    isRecord(value.collections)
  );
}

function isUiFlex(value: JsonValue): value is Extract<UiNode, { kind: "flex" }> {
  return (
    isRecord(value) &&
    value.kind === "flex" &&
    (value.direction === "row" || value.direction === "column") &&
    typeof value.gap === "number" &&
    Array.isArray(value.children)
  );
}

function isUiText(value: JsonValue): value is Extract<UiNode, { kind: "text" }> {
  return isRecord(value) && value.kind === "text" && typeof value.text === "string";
}

function isUiRect(value: JsonValue): value is Extract<UiNode, { kind: "rect" }> {
  return isRecord(value) && value.kind === "rect" && typeof value.label === "string";
}

function isUiImage(value: JsonValue): value is Extract<UiNode, { kind: "image" }> {
  return (
    isRecord(value) &&
    value.kind === "image" &&
    typeof value.label === "string" &&
    typeof value.src === "string" &&
    typeof value.alt === "string" &&
    (value.aspect === "wide" || value.aspect === "thumb")
  );
}

function isUiIcon(value: JsonValue): value is Extract<UiNode, { kind: "icon" }> {
  return (
    isRecord(value) &&
    value.kind === "icon" &&
    typeof value.label === "string" &&
    typeof value.icon === "string"
  );
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RootElement = HTMLElement & {
  __zodCrudRoot?: Root;
};

const rootElement = document.getElementById("root") as RootElement;
const root = rootElement.__zodCrudRoot ?? createRoot(rootElement);
rootElement.__zodCrudRoot = root;

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
