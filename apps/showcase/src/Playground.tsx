import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deserialize,
  getPath,
  serialize,
  type JsonKey,
  type JsonNode,
  type JsonValue,
  type NodeId,
  type OperationResult,
  type PasteMode,
} from "zod-crud";

import {
  apiCallLabel,
  type ApiId,
} from "./api-catalog.js";
import { ApiSidebar } from "./ApiSidebar.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { JsonTreeGrid } from "./JsonTreeGrid.js";
import { PanelTitle } from "./PanelTitle.js";
import {
  defaultEntityId,
  entityById,
  entityDefinitions,
  makeEditor,
  makeEditorFromValue,
} from "./entities.js";
import {
  buildGridRows,
  columns,
  expandedContainerIds,
  expandedForSelection,
  pathString,
  validExpandedIds,
  valueLabel,
} from "./grid-rows.js";
import {
  applySelection,
  focusSelection,
  liveSelectedIds,
  normalizeSelection,
  singleSelection,
  type SelectionMode,
  type SelectionState,
} from "./selection.js";

type ApiRun = {
  api: ApiId;
  call: string;
  output: unknown;
};

type UpdatePreview =
  | { state: "idle"; message: string }
  | { state: "valid"; value: JsonValue; result: OperationResult }
  | { state: "invalid"; message: string; result?: OperationResult };

const emptyOptionalJson = "";

export function Playground() {
  const [activeEntityId, setActiveEntityId] = useState(defaultEntityId);
  const activeEntity = entityById(activeEntityId);
  const editorRef = useRef(makeEditor(activeEntity));
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<SelectionState>(() => singleSelection(editorRef.current.snapshot().rootId));
  const [activeColumn, setActiveColumn] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(editorRef.current.snapshot()));
  const [activeApi, setActiveApi] = useState<ApiId>("update");
  const [keyDraft, setKeyDraft] = useState("");
  const [findKeyDraft, setFindKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [jsonValueDraft, setJsonValueDraft] = useState(emptyOptionalJson);
  const [pasteMode, setPasteMode] = useState<PasteMode>("auto");
  const [pasteIndexDraft, setPasteIndexDraft] = useState("");
  const [subscriptionEvents, setSubscriptionEvents] = useState(0);
  const [lastRun, setLastRun] = useState<ApiRun>({
    api: "snapshot",
    call: apiCallLabel("snapshot"),
    output: { ok: true, ready: true },
  });

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selection.activeId] === undefined ? doc.rootId : selection.activeId;
  const rows = useMemo(() => buildGridRows(doc, expandedIds), [doc, expandedIds]);
  const selectedIds = useMemo(() => liveSelectedIds(doc, selection, safeSelectedId), [doc, safeSelectedId, selection]);
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);
  const selectedNode = doc.nodes[safeSelectedId];
  const lastChanges = isOperationResult(lastRun.output) && lastRun.output.ok ? lastRun.output.changes ?? [] : [];
  const changedRows = useMemo(() => new Map(lastChanges.map((change) => [change.nodeId, change.type])), [lastChanges]);
  const updatePreview = useMemo(
    () => previewPrimitiveUpdate(activeEntity, jsonValue, editorRef.current.pathOf(safeSelectedId), selectedNode, valueDraft),
    [activeEntity, jsonValue, safeSelectedId, selectedNode, valueDraft],
  );

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const setExpanded = useCallback((nodeId: NodeId, open: boolean) => {
    const node = editorRef.current.snapshot().nodes[nodeId];

    if (node === undefined || node.children.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);

      if (open) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }

      return next;
    });
  }, []);

  const selectGridCell = useCallback((nodeId: NodeId, columnIndex: number, mode: SelectionMode = "single") => {
    setSelection((current) => applySelection(rows, current, nodeId, mode));
    setActiveColumn(clamp(columnIndex, 0, columns.length - 1));
  }, [rows]);

  useEffect(() => {
    const node = editorRef.current.snapshot().nodes[safeSelectedId];

    setKeyDraft(node?.key === null || node?.key === undefined ? "" : String(node.key));
    setFindKeyDraft(node?.children[0] === undefined ? "" : String(editorRef.current.snapshot().nodes[node.children[0]]?.key ?? ""));
    setValueDraft(valueInput(node));
  }, [safeSelectedId, version]);

  useEffect(() => () => {
    unsubscribeRef.current?.();
  }, []);

  function selectEntity(entityId: string) {
    const nextEntity = entityById(entityId);
    const nextEditor = makeEditor(nextEntity);

    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    editorRef.current = nextEditor;

    const nextDoc = nextEditor.snapshot();

    setActiveEntityId(nextEntity.id);
    setSelection(singleSelection(nextDoc.rootId));
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setSubscriptionEvents(0);
    setLastRun({
      api: "createJsonCrud",
      call: apiCallLabel("createJsonCrud"),
      output: { ok: true, entity: nextEntity.schemaName, snapshot: nextDoc },
    });
    refresh();
  }

  function runApi(api: ApiId = activeApi) {
    const before = editorRef.current.snapshot();
    const targetId = before.nodes[safeSelectedId] === undefined ? before.rootId : safeSelectedId;
    const targetIds = [...liveSelectedIds(before, selection, targetId)];
    let output: unknown;

    try {
      output = executeApi(api, targetId, targetIds);
    } catch (error) {
      output = failure(error);
    }

    setLastRun({
      api,
      call: apiCallLabel(api),
      output,
    });

    afterApiRun(output, targetId);
  }

  function executeApi(api: ApiId, targetId: NodeId, targetIds: NodeId[]): unknown {
    const editor = editorRef.current;

    if (api === "createJsonCrud") {
      const nextEditor = makeEditor(activeEntity);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      editorRef.current = nextEditor;
      setSubscriptionEvents(0);
      return { ok: true, entity: activeEntity.schemaName, snapshot: nextEditor.snapshot() };
    }

    if (api === "serialize") {
      return serialize(jsonValue);
    }

    if (api === "deserialize") {
      return deserialize(editor.snapshot(), targetId);
    }

    if (api === "getPath") {
      return getPath(editor.snapshot(), targetId);
    }

    if (api === "snapshot") {
      return editor.snapshot();
    }

    if (api === "toJson") {
      return editor.toJson();
    }

    if (api === "read") {
      return editor.read(targetId);
    }

    if (api === "pathOf") {
      return editor.pathOf(targetId);
    }

    if (api === "find") {
      return {
        parentId: targetId,
        key: parseKey(findKeyDraft),
        nodeId: editor.find(targetId, parseKey(findKeyDraft)),
      };
    }

    if (api === "create") {
      const value = parseOptionalJson(jsonValueDraft);
      return value.omitted
        ? editor.create(targetId, parseCreateKey(keyDraft))
        : editor.create(targetId, parseCreateKey(keyDraft), value.value);
    }

    if (api === "insertAfter") {
      const value = parseOptionalJson(jsonValueDraft);
      return value.omitted ? editor.insertAfter(targetId) : editor.insertAfter(targetId, value.value);
    }

    if (api === "insertBefore") {
      const value = parseOptionalJson(jsonValueDraft);
      return value.omitted ? editor.insertBefore(targetId) : editor.insertBefore(targetId, value.value);
    }

    if (api === "appendChild") {
      const value = parseOptionalJson(jsonValueDraft);
      return value.omitted ? editor.appendChild(targetId) : editor.appendChild(targetId, value.value);
    }

    if (api === "update") {
      if (updatePreview.state !== "valid") {
        return { ok: false, reason: updatePreview.message };
      }

      return editor.update(targetId, updatePreview.value);
    }

    if (api === "rename") {
      return editor.rename(targetId, keyDraft);
    }

    if (api === "delete") {
      return editor.delete(targetId);
    }

    if (api === "deleteMany") {
      return editor.deleteMany(targetIds);
    }

    if (api === "copy") {
      return editor.copy(targetId);
    }

    if (api === "copyMany") {
      return editor.copyMany(targetIds);
    }

    if (api === "canCopyMany") {
      return editor.canCopyMany(targetIds);
    }

    if (api === "cut") {
      return editor.cut(targetId);
    }

    if (api === "cutMany") {
      return editor.cutMany(targetIds);
    }

    if (api === "canCutMany") {
      return editor.canCutMany(targetIds);
    }

    if (api === "paste") {
      return editor.paste(targetId, pasteOptions());
    }

    if (api === "canDeleteMany") {
      return editor.canDeleteMany(targetIds);
    }

    if (api === "canPaste") {
      return editor.canPaste(targetId, pasteOptions());
    }

    if (api === "canUndo") {
      return editor.canUndo();
    }

    if (api === "canRedo") {
      return editor.canRedo();
    }

    if (api === "subscribe") {
      if (unsubscribeRef.current !== null) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
        return { ok: true, subscribed: false, events: subscriptionEvents };
      }

      unsubscribeRef.current = editor.subscribe(() => {
        setSubscriptionEvents((current) => current + 1);
      });
      return { ok: true, subscribed: true, events: subscriptionEvents };
    }

    if (api === "undo") {
      return editor.undo();
    }

    return editor.redo();
  }

  function pasteOptions() {
    const index = pasteIndexDraft.trim() === "" ? undefined : Number(pasteIndexDraft);

    return {
      mode: pasteMode,
      ...(index === undefined || !Number.isInteger(index) ? {} : { index }),
    };
  }

  function afterApiRun(output: unknown, fallbackId: NodeId) {
    const after = editorRef.current.snapshot();
    let nextSelection = fallbackId;
    let nextSelectionIds: NodeId[] | null = null;

    if (isOperationResult(output) && output.ok) {
      nextSelection = output.focusNodeId ?? output.nodeId ?? fallbackId;
      nextSelectionIds = output.focusNodeIds ?? null;
    }

    const nextActiveId = after.nodes[nextSelection] === undefined ? after.rootId : nextSelection;

    setExpandedIds((current) => expandedForSelection(after, validExpandedIds(after, current), nextActiveId));
    setSelection((current) => isOperationResult(output) && output.ok
      ? focusSelection(after, nextSelectionIds, nextActiveId)
      : normalizeSelection(after, current, nextActiveId));
    refresh();
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>zod-crud API Playground</h1>
          <span>{activeEntity.schemaName}</span>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => runApi("createJsonCrud")}>Recreate editor</button>
        </div>
      </header>

      <main className="playground-shell">
        <aside className="panel api-panel">
          <PanelTitle title="Callable APIs" detail="runtime only" />
          <ApiSidebar activeApi={activeApi} onSelect={setActiveApi} />
        </aside>

        <section className="panel tree-panel">
          <PanelTitle
            title="JsonDoc tree"
            detail={`${selectedIds.size} selected`}
          />
          <JsonTreeGrid
            doc={doc}
            expandedIds={expandedIds}
            columns={columns}
            rows={rows}
            activeColumn={activeColumn}
            changedRows={changedRows}
            selectedId={safeSelectedId}
            selectedIds={selectedIds}
            onSelect={selectGridCell}
            onMove={selectGridCell}
            onExpand={setExpanded}
          />
        </section>

        <aside className="panel workbench-panel">
          <PanelTitle title={activeApi} detail={apiCallLabel(activeApi)} />
          <ApiWorkbench
            activeApi={activeApi}
            activeEntityId={activeEntity.id}
            keyDraft={keyDraft}
            findKeyDraft={findKeyDraft}
            jsonValue={jsonValue}
            jsonValueDraft={jsonValueDraft}
            lastRun={lastRun}
            pasteIndexDraft={pasteIndexDraft}
            pasteMode={pasteMode}
            selectedIds={selectedIdList}
            selectedNode={selectedNode}
            selectedPath={pathString(doc, safeSelectedId)}
            subscriptionEvents={subscriptionEvents}
            updatePreview={updatePreview}
            valueDraft={valueDraft}
            onEntitySelect={selectEntity}
            onFindKeyDraft={setFindKeyDraft}
            onJsonValueDraft={setJsonValueDraft}
            onKeyDraft={setKeyDraft}
            onPasteIndexDraft={setPasteIndexDraft}
            onPasteMode={setPasteMode}
            onRun={() => runApi()}
            onValueDraft={setValueDraft}
          />
        </aside>
      </main>
    </>
  );
}

function ApiWorkbench({
  activeApi,
  activeEntityId,
  keyDraft,
  findKeyDraft,
  jsonValue,
  jsonValueDraft,
  lastRun,
  pasteIndexDraft,
  pasteMode,
  selectedIds,
  selectedNode,
  selectedPath,
  subscriptionEvents,
  updatePreview,
  valueDraft,
  onEntitySelect,
  onFindKeyDraft,
  onJsonValueDraft,
  onKeyDraft,
  onPasteIndexDraft,
  onPasteMode,
  onRun,
  onValueDraft,
}: {
  activeApi: ApiId;
  activeEntityId: string;
  keyDraft: string;
  findKeyDraft: string;
  jsonValue: JsonValue;
  jsonValueDraft: string;
  lastRun: ApiRun;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  selectedIds: NodeId[];
  selectedNode: JsonNode | undefined;
  selectedPath: string;
  subscriptionEvents: number;
  updatePreview: UpdatePreview;
  valueDraft: string;
  onEntitySelect: (entityId: string) => void;
  onFindKeyDraft: (value: string) => void;
  onJsonValueDraft: (value: string) => void;
  onKeyDraft: (value: string) => void;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
  onRun: () => void;
  onValueDraft: (value: string) => void;
}) {
  return (
    <div className="api-workbench">
      <section className="workbench-section">
        <h3>Entity</h3>
        <EntityRegistry
          entities={entityDefinitions}
          activeEntityId={activeEntityId}
          onSelect={onEntitySelect}
        />
      </section>

      <section className="workbench-section">
        <h3>Selection</h3>
        <pre className="mini-json">{stringify({
          activeId: selectedNode?.id ?? null,
          path: selectedPath,
          type: selectedNode?.type ?? "missing",
          key: selectedNode?.key ?? null,
          selectedIds,
        })}</pre>
      </section>

      <section className="workbench-section">
        <h3>Inputs</h3>
        <ApiInputs
          activeApi={activeApi}
          findKeyDraft={findKeyDraft}
          jsonValueDraft={jsonValueDraft}
          keyDraft={keyDraft}
          pasteIndexDraft={pasteIndexDraft}
          pasteMode={pasteMode}
          selectedNode={selectedNode}
          updatePreview={updatePreview}
          valueDraft={valueDraft}
          onFindKeyDraft={onFindKeyDraft}
          onJsonValueDraft={onJsonValueDraft}
          onKeyDraft={onKeyDraft}
          onPasteIndexDraft={onPasteIndexDraft}
          onPasteMode={onPasteMode}
          onValueDraft={onValueDraft}
        />
        <button type="button" className="run-button" onClick={onRun}>
          Run {apiCallLabel(activeApi)}
        </button>
      </section>

      <section className="workbench-section">
        <h3>Subscribe events</h3>
        <pre className="mini-json">{stringify({ events: subscriptionEvents })}</pre>
      </section>

      <section className="workbench-section">
        <h3>Last result</h3>
        <pre className="json-output">{stringify({
          api: lastRun.api,
          call: lastRun.call,
          output: lastRun.output,
        })}</pre>
      </section>

      <section className="workbench-section">
        <h3>toJson()</h3>
        <pre className="json-output">{stringify(jsonValue)}</pre>
      </section>
    </div>
  );
}

function ApiInputs({
  activeApi,
  findKeyDraft,
  jsonValueDraft,
  keyDraft,
  pasteIndexDraft,
  pasteMode,
  selectedNode,
  updatePreview,
  valueDraft,
  onFindKeyDraft,
  onJsonValueDraft,
  onKeyDraft,
  onPasteIndexDraft,
  onPasteMode,
  onValueDraft,
}: {
  activeApi: ApiId;
  findKeyDraft: string;
  jsonValueDraft: string;
  keyDraft: string;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  selectedNode: JsonNode | undefined;
  updatePreview: UpdatePreview;
  valueDraft: string;
  onFindKeyDraft: (value: string) => void;
  onJsonValueDraft: (value: string) => void;
  onKeyDraft: (value: string) => void;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
  onValueDraft: (value: string) => void;
}) {
  const needsKey = ["create", "rename"].includes(activeApi);
  const needsJsonValue = ["create", "insertAfter", "insertBefore", "appendChild"].includes(activeApi);

  return (
    <div className="input-stack">
      {activeApi === "find" ? (
        <label>
          <span>key</span>
          <input value={findKeyDraft} onChange={(event) => onFindKeyDraft(event.target.value)} />
        </label>
      ) : null}

      {needsKey ? (
        <label>
          <span>{activeApi === "rename" ? "new object key" : "child key or index"}</span>
          <input value={keyDraft} onChange={(event) => onKeyDraft(event.target.value)} />
        </label>
      ) : null}

      {needsJsonValue ? (
        <label>
          <span>value JSON, empty uses defaultFor/Zod default</span>
          <textarea
            rows={5}
            value={jsonValueDraft}
            onChange={(event) => onJsonValueDraft(event.target.value)}
          />
        </label>
      ) : null}

      {activeApi === "update" ? (
        <>
          <label>
            <span>primitive value</span>
            <input
              value={valueDraft}
              disabled={selectedNode === undefined || selectedNode.children.length > 0}
              onChange={(event) => onValueDraft(event.target.value)}
            />
          </label>
          <ValidationPreview preview={updatePreview} />
        </>
      ) : null}

      {["paste", "canPaste"].includes(activeApi) ? (
        <div className="split-inputs">
          <label>
            <span>mode</span>
            <select value={pasteMode} onChange={(event) => onPasteMode(event.target.value as PasteMode)}>
              <option value="auto">auto</option>
              <option value="child">child</option>
              <option value="overwrite">overwrite</option>
            </select>
          </label>
          <label>
            <span>index</span>
            <input value={pasteIndexDraft} onChange={(event) => onPasteIndexDraft(event.target.value)} />
          </label>
        </div>
      ) : null}

      <ApiHint activeApi={activeApi} />
    </div>
  );
}

function ValidationPreview({ preview }: { preview: UpdatePreview }) {
  if (preview.state === "idle") {
    return <div className="validation is-idle">{preview.message}</div>;
  }

  if (preview.state === "valid") {
    return (
      <div className="validation is-valid">
        <strong>Preview valid</strong>
        <span>{valueLabel(preview.value)}</span>
      </div>
    );
  }

  return (
    <div className="validation is-invalid">
      <strong>Preview invalid</strong>
      <span>{preview.message}</span>
    </div>
  );
}

function ApiHint({ activeApi }: { activeApi: ApiId }) {
  const hints: Partial<Record<ApiId, string>> = {
    copyMany: "Uses current multi-selection. Cmd/Ctrl-click toggles rows; Shift extends a range.",
    cutMany: "Batch cut succeeds only when selected nodes can be deleted as one sibling batch.",
    deleteMany: "Batch delete is one commit, one undo entry, and one focus result.",
    canDeleteMany: "Dry run for deleteMany. It must not mutate document, clipboard, or history.",
    canCutMany: "Facade over canDeleteMany in core.",
    paste: "Paste uses clipboard from copy/copyMany/cut/cutMany.",
    subscribe: "Runs subscribe on first click and unsubscribe on second click.",
    update: "Only primitive JsonNode values are edited here; object/array subtree replacement is intentionally omitted.",
  };

  const hint = hints[activeApi];

  return hint === undefined ? null : <p className="api-hint">{hint}</p>;
}

function previewPrimitiveUpdate(
  entity: ReturnType<typeof entityById>,
  jsonValue: JsonValue,
  selectedPath: Array<string | number>,
  node: JsonNode | undefined,
  draft: string,
): UpdatePreview {
  if (node === undefined) {
    return { state: "idle", message: "Select a node." };
  }

  if (node.type === "object" || node.type === "array") {
    return { state: "idle", message: "Select a primitive value node." };
  }

  const parsed = parsePrimitiveDraft(node, draft);

  if (!parsed.ok) {
    return { state: "invalid", message: parsed.reason };
  }

  try {
    const previewEditor = makeEditorFromValue(entity, jsonValue);
    const previewId = nodeIdAtPath(previewEditor, selectedPath);
    const result = previewEditor.update(previewId, parsed.value);

    if (!result.ok) {
      return {
        state: "invalid",
        message: validationMessage(result),
        result,
      };
    }

    return {
      state: "valid",
      value: parsed.value,
      result,
    };
  } catch (error) {
    return {
      state: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function nodeIdAtPath(editor: ReturnType<typeof makeEditorFromValue>, path: Array<string | number>): NodeId {
  let nodeId = editor.snapshot().rootId;

  for (const segment of path) {
    const childId = editor.find(nodeId, segment);

    if (childId === null) {
      throw new Error(`No node found at path segment ${String(segment)}.`);
    }

    nodeId = childId;
  }

  return nodeId;
}

function parsePrimitiveDraft(node: JsonNode, draft: string): { ok: true; value: JsonValue } | { ok: false; reason: string } {
  if (node.type === "string") {
    return { ok: true, value: draft };
  }

  if (node.type === "number") {
    const value = Number(draft);

    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, reason: "Number value must be finite." };
  }

  if (node.type === "boolean") {
    if (draft === "true") {
      return { ok: true, value: true };
    }

    if (draft === "false") {
      return { ok: true, value: false };
    }

    return { ok: false, reason: "Boolean value must be true or false." };
  }

  if (draft === "" || draft === "null") {
    return { ok: true, value: null };
  }

  return { ok: false, reason: "Null value must stay null." };
}

function parseOptionalJson(draft: string): { omitted: true } | { omitted: false; value: JsonValue } {
  if (draft.trim() === "") {
    return { omitted: true };
  }

  return {
    omitted: false,
    value: JSON.parse(draft) as JsonValue,
  };
}

function parseKey(value: string): JsonKey {
  const trimmed = value.trim();

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
}

function parseCreateKey(value: string): string | number {
  const key = parseKey(value);

  if (key === null) {
    throw new Error("Create key cannot be null.");
  }

  return key;
}

function valueInput(node: JsonNode | undefined): string {
  if (node === undefined || node.value === undefined) {
    return "";
  }

  return String(node.value);
}

function isOperationResult(value: unknown): value is OperationResult {
  return typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean";
}

function validationMessage(result: OperationResult): string {
  if (result.ok) {
    return "Valid.";
  }

  const issues = result.error?.issues?.map((issue) => `${issue.path.join(".") || "/"}: ${issue.message}`);

  return issues === undefined || issues.length === 0
    ? result.reason
    : `${result.reason} ${issues.join(" ")}`;
}

function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        ...("issues" in item ? { issues: (item as { issues: unknown }).issues } : {}),
      };
    }

    return item;
  }, 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
