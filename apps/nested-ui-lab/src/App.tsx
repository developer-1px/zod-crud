import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NodeId, OperationResult } from "zod-crud";

import {
  labEntity,
  makeEditor,
} from "./entities.js";
import {
  buildRows,
  canUpdateNode,
  expandedContainerIds,
  expandedForSelection,
  insertionArrayId,
  parseNodeValue,
  pathString,
  validExpandedIds,
  valueInput,
} from "./projections.js";
import { routeForPath, routes } from "./App.routes.js";
import { CommandBar, PanelTitle, RouteSidebar } from "./App.chrome.js";
import {
  CardsProjection,
  Inspector,
  OutlineProjection,
  TreeGridProjection,
  type CommandLog,
} from "./App.views.js";

export function App() {
  const editorRef = useRef(makeEditor());
  const [version, setVersion] = useState(0);
  const initialDoc = editorRef.current.snapshot();
  const [selectedId, setSelectedId] = useState<NodeId>(initialDoc.rootId);
  const [expandedIds, setExpandedIds] = useState<Set<NodeId>>(() => expandedContainerIds(initialDoc));
  const [activeRoute, setActiveRoute] = useState(() => routeForPath(window.location.pathname));
  const [lastCommand, setLastCommand] = useState<CommandLog>({
    command: "ready",
    result: { ok: true },
  });
  const [keyDraft, setKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");

  const doc = useMemo(() => editorRef.current.snapshot(), [version]);
  const safeSelectedId = doc.nodes[selectedId] === undefined ? doc.rootId : selectedId;
  const selectedNode = doc.nodes[safeSelectedId];
  const rows = useMemo(() => buildRows(doc, expandedIds), [doc, expandedIds]);
  const viewMode = activeRoute.mode;
  const changedRows = useMemo(() => {
    const changes = lastCommand.result.ok ? lastCommand.result.changes ?? [] : [];
    return new Map(changes.map((change) => [change.nodeId, change.type]));
  }, [lastCommand.result]);
  const jsonValue = useMemo(() => editorRef.current.toJson(), [version]);
  const canPaste = editorRef.current.canPaste(safeSelectedId).ok;

  useEffect(() => {
    const node = doc.nodes[safeSelectedId];

    setKeyDraft(node?.key === null || node?.key === undefined ? "" : String(node.key));
    setValueDraft(valueInput(node));
  }, [doc, safeSelectedId]);

  useEffect(() => {
    if (window.location.pathname !== activeRoute.path) {
      window.history.replaceState(null, "", activeRoute.path);
    }

    function onPopState() {
      setActiveRoute(routeForPath(window.location.pathname));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeRoute.path]);

  function refresh() {
    setVersion((current) => current + 1);
  }

  function navigateRoute(route: (typeof routes)[number]) {
    if (route.path !== window.location.pathname) {
      window.history.pushState(null, "", route.path);
    }

    setActiveRoute(route);
  }

  function selectNode(nodeId: NodeId) {
    const nextDoc = editorRef.current.snapshot();

    if (nextDoc.nodes[nodeId] === undefined) {
      return;
    }

    setSelectedId(nodeId);
    setExpandedIds((current) => expandedForSelection(nextDoc, current, nodeId));
  }

  function toggleExpanded(nodeId: NodeId) {
    const node = doc.nodes[nodeId];

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
  }

  function reset() {
    editorRef.current = makeEditor();

    const nextDoc = editorRef.current.snapshot();

    setSelectedId(nextDoc.rootId);
    setExpandedIds(expandedContainerIds(nextDoc));
    setLastCommand({ command: "reset", result: { ok: true } });
    refresh();
  }

  function runCommand(command: string, action: () => OperationResult) {
    const result = action();

    setLastCommand({ command, result });

    if (result.ok) {
      const nextDoc = editorRef.current.snapshot();
      const focusId = result.focusNodeId ?? result.nodeId ?? safeSelectedId;
      const nextSelectedId = nextDoc.nodes[focusId] === undefined ? nextDoc.rootId : focusId;

      setSelectedId(nextSelectedId);
      setExpandedIds((current) => expandedForSelection(nextDoc, validExpandedIds(nextDoc, current), nextSelectedId));
      refresh();
    }
  }

  function addChild() {
    runCommand("create", () => {
      const current = editorRef.current.snapshot();
      const arrayId = insertionArrayId(current, safeSelectedId, labEntity.childKeys);

      if (arrayId === null) {
        return { ok: false, reason: "Select an array or an object with a child array." };
      }

      const parent = current.nodes[arrayId];

      if (parent === undefined) {
        return { ok: false, reason: "Insertion target is missing." };
      }

      return editorRef.current.create(arrayId, parent.children.length, labEntity.createValue(parent, parent.children.length));
    });
  }

  function renameSelected() {
    runCommand("rename", () => editorRef.current.rename(safeSelectedId, keyDraft));
  }

  function updateSelected() {
    runCommand("update", () => {
      const node = editorRef.current.snapshot().nodes[safeSelectedId];

      if (node === undefined) {
        return { ok: false, reason: "Selected node is missing." };
      }

      if (!canUpdateNode(node)) {
        return { ok: false, reason: "Only primitive values can be updated here." };
      }

      try {
        return editorRef.current.update(safeSelectedId, parseNodeValue(node, valueDraft));
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  function copySelected() {
    try {
      editorRef.current.copy(safeSelectedId);
      setLastCommand({ command: "copy", result: { ok: true } });
    } catch (error) {
      setLastCommand({
        command: "copy",
        result: { ok: false, reason: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Nested UI projection lab</h1>
          <span>{labEntity.label}</span>
        </div>
      </header>

      <main className="app-shell">
        <CommandBar
          canDelete={safeSelectedId !== doc.rootId}
          canPaste={canPaste}
          onAdd={addChild}
          onCopy={copySelected}
          onCut={() => runCommand("cut", () => editorRef.current.cut(safeSelectedId))}
          onDelete={() => runCommand("delete", () => editorRef.current.delete(safeSelectedId))}
          onPaste={() => runCommand("paste", () => editorRef.current.paste(safeSelectedId))}
          onRedo={() => runCommand("redo", () => editorRef.current.redo())}
          onReset={reset}
          onUndo={() => runCommand("undo", () => editorRef.current.undo())}
        />

        <section className="workspace">
          <RouteSidebar activePath={activeRoute.path} onNavigate={navigateRoute} />

          <section className="panel projection-panel">
            <PanelTitle title={activeRoute.label} detail={`${Object.keys(doc.nodes).length} nodes`} />
            {viewMode === "treegrid" ? (
              <TreeGridProjection
                changedRows={changedRows}
                doc={doc}
                expandedIds={expandedIds}
                rows={rows}
                selectedId={safeSelectedId}
                onSelect={selectNode}
                onToggle={toggleExpanded}
              />
            ) : null}
            {viewMode === "outline" ? (
              <OutlineProjection
                changedRows={changedRows}
                doc={doc}
                expandedIds={expandedIds}
                nodeId={doc.rootId}
                selectedId={safeSelectedId}
                onSelect={selectNode}
                onToggle={toggleExpanded}
              />
            ) : null}
            {viewMode === "cards" ? (
              <CardsProjection
                changedRows={changedRows}
                doc={doc}
                nodeId={doc.rootId}
                selectedId={safeSelectedId}
                onSelect={selectNode}
              />
            ) : null}
          </section>

          <aside className="panel inspector-panel">
            <PanelTitle title="Inspector" detail={selectedNode === undefined ? "missing" : pathString(doc, safeSelectedId)} />
            <Inspector
              doc={doc}
              keyDraft={keyDraft}
              lastCommand={lastCommand}
              selectedId={safeSelectedId}
              selectedNode={selectedNode}
              valueDraft={valueDraft}
              onKeyDraft={setKeyDraft}
              onRename={renameSelected}
              onUpdate={updateSelected}
              onValueDraft={setValueDraft}
            />
            <PanelTitle title="JSON" detail="current document" />
            <pre className="json-output">{JSON.stringify(jsonValue, null, 2)}</pre>
          </aside>
        </section>
      </main>
    </>
  );
}
