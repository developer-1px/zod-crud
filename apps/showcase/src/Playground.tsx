import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  JsonValue,
  NodeId,
  OperationResult,
} from "zod-crud";

import {
  CommandStrip,
  type CommandId,
} from "./CommandStrip.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { InspectorPanel, type CommandLog } from "./InspectorPanel.js";
import { JsonTreeGrid } from "./JsonTreeGrid.js";
import { PanelTitle } from "./PanelTitle.js";
import {
  defaultEntityId,
  entityById,
  entityDefinitions,
  makeEditor,
} from "./entities.js";
import {
  buildGridRows,
  columns,
  expandedContainerIds,
  expandedForSelection,
  insertionArrayId,
  validExpandedIds,
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

export function Playground() {
  const [activeEntityId, setActiveEntityId] = useState(defaultEntityId);
  const activeEntity = entityById(activeEntityId);
  const editorRef = useRef(makeEditor(activeEntity));
  const nextItemRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<SelectionState>(() => singleSelection(editorRef.current.snapshot().rootId));
  const [activeColumn, setActiveColumn] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(editorRef.current.snapshot()));
  const [clipboardValue, setClipboardValue] = useState<JsonValue | JsonValue[] | null>(null);
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    result: { ok: true },
  });

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selection.activeId] === undefined ? doc.rootId : selection.activeId;
  const rows = useMemo(() => buildGridRows(doc, expandedIds), [doc, expandedIds]);
  const selectedIds = useMemo(() => liveSelectedIds(doc, selection, safeSelectedId), [doc, safeSelectedId, selection]);
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);
  const canCopy = editorRef.current.canCopyMany(selectedIdList).ok;
  const canCut = editorRef.current.canCutMany(selectedIdList).ok;
  const canDelete = editorRef.current.canDeleteMany(selectedIdList).ok;
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;
  const lastChanges = lastCommand.result.ok ? lastCommand.result.changes ?? [] : [];
  const changedRows = useMemo(() => new Map(lastChanges.map((change) => [change.nodeId, change.type])), [lastChanges]);

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
    const targetIdList = [...targetIds];
    let result: OperationResult = { ok: true };
    let nextSelection = targetId;
    let collapseToSingleSelection = false;
    let nextSelectionIds: NodeId[] | null = null;

    try {
      if (command === "copy") {
        setClipboardValue(targetIds.size > 1 ? editor.copyMany(targetIdList) : editor.copy(targetId));
      }

      if (command === "cut") {
        const copied = targetIds.size > 1 ? targetIdList.map((nodeId) => editor.read(nodeId)) : editor.read(targetId);

        result = targetIds.size > 1 ? editor.cutMany(targetIdList) : editor.cut(targetId);

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
    setLastCommand({
      command,
      result,
    });
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
      result,
    });
    refresh();
  }

  function reset() {
    editorRef.current = makeEditor(activeEntity);
    nextItemRef.current = 1;
    setClipboardValue(null);

    const nextDoc = editorRef.current.snapshot();

    setSelection(singleSelection(nextDoc.rootId));
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setLastCommand({
      command: "reset",
      result: { ok: true },
    });
    refresh();
  }

  function selectEntity(entityId: string) {
    const nextEntity = entityById(entityId);
    const nextEditor = makeEditor(nextEntity);

    editorRef.current = nextEditor;

    const nextDoc = nextEditor.snapshot();

    setActiveEntityId(nextEntity.id);
    setSelection(singleSelection(nextDoc.rootId));
    setActiveColumn(0);
    setExpandedIds(expandedContainerIds(nextDoc));
    setClipboardValue(null);
    setLastCommand({
      command: "select entity",
      result: { ok: true },
    });
    refresh();
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>JSON treegrid playground</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={addChild}>Add child</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>

      <main className="app-shell">
        <CommandStrip
          activeCommand={lastCommand.command}
          canCopy={canCopy}
          canCut={canCut}
          canDelete={canDelete}
          canPaste={canPaste}
          onCommand={runCommand}
        />

        <section className="workspace">
          <aside className="panel">
            <PanelTitle title="Registered entities" detail={`${entityDefinitions.length} Zod schemas`} />
            <EntityRegistry
              entities={entityDefinitions}
              activeEntityId={activeEntity.id}
              onSelect={selectEntity}
            />
          </aside>

          <section className="panel">
            <PanelTitle
              title={`${activeEntity.label} JsonDoc`}
              detail={`${selectedIds.size} selected`}
            />
            <JsonTreeGrid
              columns={columns}
              rows={rows}
              activeColumn={activeColumn}
              changedRows={changedRows}
              selectedId={safeSelectedId}
              selectedIds={selectedIds}
              onSelect={selectGridCell}
              onMove={selectGridCell}
              onToggle={toggleExpanded}
            />
          </section>

          <InspectorPanel
            doc={doc}
            jsonValue={jsonValue}
            lastCommand={lastCommand}
            safeSelectedId={safeSelectedId}
            selectedIds={selectedIds}
          />
        </section>
      </main>
    </>
  );
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
