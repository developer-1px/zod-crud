import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
import {
  CommandMatrix,
} from "./CommandMatrix.js";
import {
  commandByApi,
  commandInputLabel,
  resolveKeyboardApi,
} from "./command-matrix.js";
import {
  parsePrimitiveDraft,
  prepareUserCommand,
  type UpdatePreview,
} from "./command-inputs.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { JsonTreeGrid } from "./JsonTreeGrid.js";
import { PanelTitle } from "./PanelTitle.js";
import {
  executePublicCall,
} from "./public-call-adapter.js";
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
import {
  enumOptionDraft,
  enumOptionKey,
  enumOptionLabel,
  enumValueOptionsAtPath,
  type EnumValueOption,
} from "./schema-options.js";

type ApiRun = {
  api: ApiId;
  call: string;
  output: unknown;
};

type InlineEdit = {
  nodeId: NodeId;
  draft: string;
};

type InlineNotice = {
  nodeId: NodeId;
  kind: "idle" | "valid" | "invalid";
  message: string;
};

const emptyOptionalJson = "";

export function Playground() {
  const [activeEntityId, setActiveEntityId] = useState(defaultEntityId);
  const activeEntity = entityById(activeEntityId);
  const editorRef = useRef(makeEditor(activeEntity));
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<SelectionState>(() => singleSelection(editorRef.current.snapshot().rootId));
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(editorRef.current.snapshot()));
  const [activeApi, setActiveApi] = useState<ApiId>("update");
  const [keyDraft, setKeyDraft] = useState("");
  const [findKeyDraft, setFindKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [jsonValueDraft, setJsonValueDraft] = useState(emptyOptionalJson);
  const [pasteMode, setPasteMode] = useState<PasteMode>("auto");
  const [pasteIndexDraft, setPasteIndexDraft] = useState("");
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
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
  const selectedValueOptions = useMemo(
    () => selectedNode === undefined || selectedNode.children.length > 0
      ? []
      : enumValueOptionsAtPath(activeEntity.schema, editorRef.current.pathOf(safeSelectedId)),
    [activeEntity.schema, safeSelectedId, selectedNode],
  );
  const inlineValueOptions = useMemo(() => {
    if (inlineEdit === null) {
      return [];
    }

    const node = doc.nodes[inlineEdit.nodeId];

    return node === undefined || node.children.length > 0
      ? []
      : enumValueOptionsAtPath(activeEntity.schema, editorRef.current.pathOf(inlineEdit.nodeId));
  }, [activeEntity.schema, doc, inlineEdit]);
  const rowValueOptions = useMemo(() => {
    const optionsByNodeId = new Map<NodeId, EnumValueOption[]>();

    for (const row of rows) {
      const node = doc.nodes[row.id];

      if (node !== undefined && node.children.length === 0) {
        const options = enumValueOptionsAtPath(activeEntity.schema, editorRef.current.pathOf(row.id));

        if (options.length > 0) {
          optionsByNodeId.set(row.id, options);
        }
      }
    }

    return optionsByNodeId;
  }, [activeEntity.schema, doc, rows]);
  const lastChanges = isOperationResult(lastRun.output) && lastRun.output.ok ? lastRun.output.changes ?? [] : [];
  const changedRows = useMemo(() => new Map(lastChanges.map((change) => [change.nodeId, change.type])), [lastChanges]);
  const updatePreview = useMemo(
    () => previewPrimitiveUpdate(activeEntity, jsonValue, editorRef.current.pathOf(safeSelectedId), selectedNode, valueDraft),
    [activeEntity, jsonValue, safeSelectedId, selectedNode, valueDraft],
  );
  const inlineUpdatePreview = useMemo(() => {
    if (inlineEdit === null || doc.nodes[inlineEdit.nodeId] === undefined) {
      return null;
    }

    return previewPrimitiveUpdate(
      activeEntity,
      jsonValue,
      editorRef.current.pathOf(inlineEdit.nodeId),
      doc.nodes[inlineEdit.nodeId],
      inlineEdit.draft,
    );
  }, [activeEntity, doc, inlineEdit, jsonValue]);
  const inlineStatus = useMemo(() => {
    if (inlineEdit !== null) {
      if (inlineUpdatePreview?.state === "valid") {
        return {
          nodeId: inlineEdit.nodeId,
          kind: "valid" as const,
          message: `Valid: ${valueLabel(inlineUpdatePreview.value)}`,
        };
      }

      if (inlineUpdatePreview?.state === "invalid") {
        return {
          nodeId: inlineEdit.nodeId,
          kind: "invalid" as const,
          message: `Invalid: ${inlineUpdatePreview.message}`,
        };
      }

      return {
        nodeId: inlineEdit.nodeId,
        kind: "idle" as const,
        message: "Enter commits. Esc cancels.",
      };
    }

    return inlineNotice;
  }, [inlineEdit, inlineNotice, inlineUpdatePreview]);

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

  const selectGridRow = useCallback((nodeId: NodeId, mode: SelectionMode = "single") => {
    setSelection((current) => applySelection(rows, current, nodeId, mode));
    setInlineNotice(null);
    window.setTimeout(() => document.querySelector<HTMLElement>(".treegrid")?.focus(), 0);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (commandKey && key === "enter") {
        event.preventDefault();
        runApi(activeApi);
        return;
      }

      if (isTextEntryTarget(event.target)) {
        return;
      }

      const shortcutApi = resolveKeyboardApi(event, selectedIdList.length);

      if (shortcutApi !== null) {
        event.preventDefault();
        runApi(shortcutApi);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  });

  function selectEntity(entityId: string) {
    const nextEntity = entityById(entityId);
    const nextEditor = makeEditor(nextEntity);

    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    editorRef.current = nextEditor;

    const nextDoc = nextEditor.snapshot();

    setActiveEntityId(nextEntity.id);
    setSelection(singleSelection(nextDoc.rootId));
    setExpandedIds(expandedContainerIds(nextDoc));
    setInlineEdit(null);
    setInlineNotice(null);
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
    const prepared = prepareUserCommand(api, {
      findKeyDraft,
      jsonValueDraft,
      keyDraft,
      pasteIndexDraft,
      pasteMode,
      updatePreview,
    });
    let output: unknown;

    if (prepared.ok) {
      try {
        output = executePublicCall(prepared.command, {
          createEditor: () => {
            const nextEditor = makeEditor(activeEntity);

            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
            editorRef.current = nextEditor;
            setSubscriptionEvents(0);

            return {
              entity: activeEntity.schemaName,
              snapshot: nextEditor.snapshot(),
            };
          },
          editor: editorRef.current,
          jsonValue,
          targetId,
          targetIds,
          toggleSubscribe: () => {
            if (unsubscribeRef.current !== null) {
              unsubscribeRef.current();
              unsubscribeRef.current = null;
              return { ok: true, subscribed: false, events: subscriptionEvents };
            }

            unsubscribeRef.current = editorRef.current.subscribe(() => {
              setSubscriptionEvents((current) => current + 1);
            });

            return { ok: true, subscribed: true, events: subscriptionEvents };
          },
        });
      } catch (error) {
        output = failure(error);
      }
    } else {
      output = prepared.output;
    }

    setLastRun({
      api,
      call: apiCallLabel(api),
      output,
    });
    setActiveApi(api);
    setInlineEdit(null);

    afterApiRun(output, targetId);
  }

  function startInlineValueEdit(nodeId: NodeId) {
    const node = editorRef.current.snapshot().nodes[nodeId];

    if (node === undefined || node.children.length > 0) {
      setInlineEdit(null);
      setInlineNotice({
        nodeId,
        kind: "invalid",
        message: "Only primitive values can be edited.",
      });
      return;
    }

    setActiveApi("update");
    setSelection(singleSelection(nodeId));
    setValueDraft(valueInput(node));
    setInlineNotice(null);
    setInlineEdit({
      nodeId,
      draft: valueInput(node),
    });
  }

  function commitInlineValueEdit() {
    if (inlineEdit === null) {
      return;
    }

    const node = editorRef.current.snapshot().nodes[inlineEdit.nodeId];
    const preview = inlineUpdatePreview;

    if (node === undefined || preview === null) {
      setInlineEdit(null);
      return;
    }

    if (preview.state !== "valid") {
      setLastRun({
        api: "update",
        call: apiCallLabel("update"),
        output: {
          ok: false,
          reason: preview.message,
        },
      });
      setActiveApi("update");
      setValueDraft(inlineEdit.draft);
      setInlineNotice({
        nodeId: inlineEdit.nodeId,
        kind: "invalid",
        message: preview.message,
      });
      return;
    }

    const result = editorRef.current.update(inlineEdit.nodeId, preview.value);

    setLastRun({
      api: "update",
      call: apiCallLabel("update"),
      output: result,
    });
    setActiveApi("update");
    setValueDraft(inlineEdit.draft);

    if (result.ok) {
      setInlineEdit(null);
      setInlineNotice({
        nodeId: inlineEdit.nodeId,
        kind: "valid",
        message: `Committed: ${valueLabel(preview.value)}`,
      });
    } else {
      setInlineNotice({
        nodeId: inlineEdit.nodeId,
        kind: "invalid",
        message: validationMessage(result),
      });
    }

    afterApiRun(result, inlineEdit.nodeId);
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
        <div className="header-main">
          <div>
            <h1>zod-crud API Playground</h1>
            <span>{activeEntity.schemaName}</span>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => runApi("createJsonCrud")}>Recreate editor</button>
          </div>
        </div>
      </header>

      <main className="playground-shell">
        <aside className="panel api-panel">
          <PanelTitle title="Command matrix" detail="keymap -> public call" />
          <CommandMatrix activeApi={activeApi} onRun={runApi} onSelect={setActiveApi} />
        </aside>

        <section className="panel tree-panel">
          <PanelTitle
            title="JsonDoc tree"
            detail={`${selectedIds.size} selected`}
          />
          <JsonTreeGrid
            doc={doc}
            columns={columns}
            rows={rows}
            changedRows={changedRows}
            valueOptionsByNodeId={rowValueOptions}
            selectedId={safeSelectedId}
            selectedIds={selectedIds}
            inlineEdit={inlineEdit === null ? null : {
              ...inlineEdit,
              invalid: inlineUpdatePreview?.state === "invalid",
              options: inlineValueOptions,
            }}
            inlineStatus={inlineStatus}
            onSelect={selectGridRow}
            onMove={selectGridRow}
            onExpand={setExpanded}
            onStartValueEdit={startInlineValueEdit}
            onInlineValueDraft={(draft) => {
              setValueDraft(draft);
              setInlineNotice(null);
              setInlineEdit((current) => current === null ? null : { ...current, draft });
            }}
            onCommitValueEdit={commitInlineValueEdit}
            onCancelValueEdit={() => {
              setInlineEdit(null);
              setInlineNotice(null);
            }}
          />
        </section>

        <aside className="panel workbench-panel">
          <PanelTitle title="Runner" detail={apiCallLabel(activeApi)} />
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
            valueOptions={selectedValueOptions}
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
  valueOptions,
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
  valueOptions: EnumValueOption[];
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
          valueOptions={valueOptions}
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
        <h3>Last result</h3>
        <pre className="json-output">{stringify({
          api: lastRun.api,
          call: lastRun.call,
          output: lastRun.output,
        })}</pre>
      </section>

      <CommandDocs activeApi={activeApi} subscriptionEvents={subscriptionEvents} />

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
  valueOptions,
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
  valueOptions: EnumValueOption[];
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
            {valueOptions.length > 0 ? (
              <select
                value={valueDraft}
                disabled={selectedNode === undefined || selectedNode.children.length > 0}
                onChange={(event) => onValueDraft(event.target.value)}
              >
                {valueOptions.map((option) => (
                  <option key={enumOptionKey(option)} value={enumOptionDraft(option)}>
                    {enumOptionLabel(option)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={valueDraft}
                disabled={selectedNode === undefined || selectedNode.children.length > 0}
                onChange={(event) => onValueDraft(event.target.value)}
              />
            )}
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

function CommandDocs({
  activeApi,
  subscriptionEvents,
}: {
  activeApi: ApiId;
  subscriptionEvents: number;
}) {
  const command = commandByApi(activeApi);

  return (
    <section className="workbench-section docs-section">
      <h3>Docs</h3>
      <dl className="command-docs">
        <div>
          <dt>User input</dt>
          <dd>{commandInputLabel(command.input)}</dd>
        </div>
        <div>
          <dt>Keymap</dt>
          <dd>{command.keys === "" ? "manual only" : command.keys}</dd>
        </div>
        <div>
          <dt>Public call</dt>
          <dd><code>{command.call}</code></dd>
        </div>
        <div>
          <dt>Subscription events</dt>
          <dd>{subscriptionEvents}</dd>
        </div>
      </dl>
      {command.notes === "" ? null : <p className="api-hint">{command.notes}</p>}
    </section>
  );
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

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
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
