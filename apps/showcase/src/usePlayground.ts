import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { JsonNode, NodeId, OperationResult } from "zod-crud";

import { apiCallLabel, type ApiId } from "./api-catalog.js";
import { resolveKeyboardApi } from "./command-matrix.js";
import { prepareUserCommand } from "./command-inputs.js";
import { executePublicCall } from "./public-call-adapter.js";
import {
  defaultEntityId,
  entityById,
  makeEditor,
} from "./entities.js";
import {
  buildGridRows,
  expandedContainerIds,
  expandedForSelection,
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
  enumValueOptionsAtPath,
  type EnumValueOption,
} from "./schema-options.js";
import type { ApiRun } from "./ApiWorkbench.js";
import {
  failure,
  isOperationResult,
  isTextEntryTarget,
  previewPrimitiveUpdate,
  validationMessage,
  valueInput,
} from "./playground-helpers.js";
import type { PasteMode } from "zod-crud";

type InlineEdit = { nodeId: NodeId; draft: string };
type InlineNotice = { nodeId: NodeId; kind: "idle" | "valid" | "invalid"; message: string };

const emptyOptionalJson = "";

export function usePlayground() {
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
    if (inlineEdit === null) return [];
    const node = doc.nodes[inlineEdit.nodeId];
    return node === undefined || node.children.length > 0
      ? []
      : enumValueOptionsAtPath(activeEntity.schema, editorRef.current.pathOf(inlineEdit.nodeId));
  }, [activeEntity.schema, doc, inlineEdit]);
  const rowValueOptions = useMemo(() => {
    const map = new Map<NodeId, EnumValueOption[]>();
    for (const row of rows) {
      const node = doc.nodes[row.id];
      if (node !== undefined && node.children.length === 0) {
        const options = enumValueOptionsAtPath(activeEntity.schema, editorRef.current.pathOf(row.id));
        if (options.length > 0) map.set(row.id, options);
      }
    }
    return map;
  }, [activeEntity.schema, doc, rows]);
  const lastChanges = isOperationResult(lastRun.output) && lastRun.output.ok ? lastRun.output.changes ?? [] : [];
  const changedRows = useMemo(() => new Map(lastChanges.map((change) => [change.nodeId, change.type])), [lastChanges]);
  const updatePreview = useMemo(
    () => previewPrimitiveUpdate(activeEntity, jsonValue, editorRef.current.pathOf(safeSelectedId), selectedNode, valueDraft),
    [activeEntity, jsonValue, safeSelectedId, selectedNode, valueDraft],
  );
  const inlineUpdatePreview = useMemo(() => {
    if (inlineEdit === null || doc.nodes[inlineEdit.nodeId] === undefined) return null;
    return previewPrimitiveUpdate(
      activeEntity, jsonValue, editorRef.current.pathOf(inlineEdit.nodeId),
      doc.nodes[inlineEdit.nodeId], inlineEdit.draft,
    );
  }, [activeEntity, doc, inlineEdit, jsonValue]);
  const inlineStatus = useMemo(() => {
    if (inlineEdit !== null) {
      if (inlineUpdatePreview?.state === "valid") {
        return { nodeId: inlineEdit.nodeId, kind: "valid" as const, message: `Valid: ${valueLabel(inlineUpdatePreview.value)}` };
      }
      if (inlineUpdatePreview?.state === "invalid") {
        return { nodeId: inlineEdit.nodeId, kind: "invalid" as const, message: `Invalid: ${inlineUpdatePreview.message}` };
      }
      return { nodeId: inlineEdit.nodeId, kind: "idle" as const, message: "Enter commits. Esc cancels." };
    }
    return inlineNotice;
  }, [inlineEdit, inlineNotice, inlineUpdatePreview]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const setExpanded = useCallback((nodeId: NodeId, open: boolean) => {
    const node = editorRef.current.snapshot().nodes[nodeId];
    if (node === undefined || node.children.length === 0) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      if (open) next.add(nodeId); else next.delete(nodeId);
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

  useEffect(() => () => { unsubscribeRef.current?.(); }, []);

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

  function runApi(api: ApiId = activeApi) {
    const before = editorRef.current.snapshot();
    const targetId = before.nodes[safeSelectedId] === undefined ? before.rootId : safeSelectedId;
    const targetIds = [...liveSelectedIds(before, selection, targetId)];
    const prepared = prepareUserCommand(api, { findKeyDraft, jsonValueDraft, keyDraft, pasteIndexDraft, pasteMode, updatePreview });
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
            return { entity: activeEntity.schemaName, snapshot: nextEditor.snapshot() };
          },
          editor: editorRef.current,
          jsonValue, targetId, targetIds,
          toggleSubscribe: () => {
            if (unsubscribeRef.current !== null) {
              unsubscribeRef.current();
              unsubscribeRef.current = null;
              return { ok: true, subscribed: false, events: subscriptionEvents };
            }
            unsubscribeRef.current = editorRef.current.subscribe(() => setSubscriptionEvents((c) => c + 1));
            return { ok: true, subscribed: true, events: subscriptionEvents };
          },
        });
      } catch (error) { output = failure(error); }
    } else { output = prepared.output; }
    setLastRun({ api, call: apiCallLabel(api), output });
    setActiveApi(api);
    setInlineEdit(null);
    afterApiRun(output, targetId);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (commandKey && key === "enter") { event.preventDefault(); runApi(activeApi); return; }
      if (isTextEntryTarget(event.target)) return;
      const shortcutApi = resolveKeyboardApi(event, selectedIdList.length);
      if (shortcutApi !== null) { event.preventDefault(); runApi(shortcutApi); }
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
    setLastRun({ api: "createJsonCrud", call: apiCallLabel("createJsonCrud"), output: { ok: true, entity: nextEntity.schemaName, snapshot: nextDoc } });
    refresh();
  }

  function startInlineValueEdit(nodeId: NodeId) {
    const node = editorRef.current.snapshot().nodes[nodeId];
    if (node === undefined || node.children.length > 0) {
      setInlineEdit(null);
      setInlineNotice({ nodeId, kind: "invalid", message: "Only primitive values can be edited." });
      return;
    }
    setActiveApi("update");
    setSelection(singleSelection(nodeId));
    setValueDraft(valueInput(node));
    setInlineNotice(null);
    setInlineEdit({ nodeId, draft: valueInput(node) });
  }

  function commitInlineValueEdit() {
    if (inlineEdit === null) return;
    const node = editorRef.current.snapshot().nodes[inlineEdit.nodeId];
    const preview = inlineUpdatePreview;
    if (node === undefined || preview === null) { setInlineEdit(null); return; }
    if (preview.state !== "valid") {
      setLastRun({ api: "update", call: apiCallLabel("update"), output: { ok: false, reason: preview.message } });
      setActiveApi("update");
      setValueDraft(inlineEdit.draft);
      setInlineNotice({ nodeId: inlineEdit.nodeId, kind: "invalid", message: preview.message });
      return;
    }
    const result = editorRef.current.update(inlineEdit.nodeId, preview.value);
    setLastRun({ api: "update", call: apiCallLabel("update"), output: result });
    setActiveApi("update");
    setValueDraft(inlineEdit.draft);
    if (result.ok) {
      setInlineEdit(null);
      setInlineNotice({ nodeId: inlineEdit.nodeId, kind: "valid", message: `Committed: ${valueLabel(preview.value)}` });
    } else {
      setInlineNotice({ nodeId: inlineEdit.nodeId, kind: "invalid", message: validationMessage(result) });
    }
    afterApiRun(result, inlineEdit.nodeId);
  }

  return {
    activeApi, activeEntity, doc, safeSelectedId, rows, selectedIds, selectedIdList,
    selectedNode: selectedNode as JsonNode | undefined, jsonValue,
    selectedValueOptions, inlineValueOptions, rowValueOptions,
    changedRows, updatePreview, inlineUpdatePreview, inlineStatus, inlineEdit,
    keyDraft, findKeyDraft, valueDraft, jsonValueDraft, pasteMode, pasteIndexDraft,
    subscriptionEvents, lastRun,
    setActiveApi, setKeyDraft, setFindKeyDraft, setValueDraft, setJsonValueDraft,
    setPasteMode, setPasteIndexDraft, setInlineEdit, setInlineNotice,
    setExpanded, selectGridRow, runApi, selectEntity, startInlineValueEdit, commitInlineValueEdit,
  };
}
