import type { JsonChange, NodeId } from "zod-crud";
import { routes } from "./App.routes.js";

export function RouteSidebar({
  activePath,
  onNavigate,
}: {
  activePath: string;
  onNavigate: (route: (typeof routes)[number]) => void;
}) {
  return (
    <aside className="panel route-sidebar">
      <PanelTitle title="Routes" detail={`${routes.length} available`} />
      <nav className="route-list" aria-label="Available routes">
        {routes.map((route) => (
          <a
            key={route.path}
            href={route.path}
            aria-current={route.path === activePath ? "page" : undefined}
            className={route.path === activePath ? "route-link is-active" : "route-link"}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(route);
            }}
          >
            <span>{route.label}</span>
            <small>{route.path}</small>
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function CommandBar({
  canDelete,
  canPaste,
  onAdd,
  onCopy,
  onCut,
  onDelete,
  onPaste,
  onRedo,
  onReset,
  onUndo,
}: {
  canDelete: boolean;
  canPaste: boolean;
  onAdd: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onReset: () => void;
  onUndo: () => void;
}) {
  return (
    <nav className="command-bar" aria-label="Document commands">
      <button type="button" onClick={onAdd}>Add child</button>
      <button type="button" onClick={onCopy}>Copy</button>
      <button type="button" disabled={!canDelete} onClick={onCut}>Cut</button>
      <button type="button" disabled={!canPaste} onClick={onPaste}>Paste</button>
      <button type="button" disabled={!canDelete} onClick={onDelete}>Delete</button>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onRedo}>Redo</button>
      <button type="button" onClick={onReset}>Reset</button>
    </nav>
  );
}

export function PanelTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

export function rowClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return composeClass("grid-row", nodeId, selectedId, changedRows);
}

export function itemClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return composeClass("outline-item", nodeId, selectedId, changedRows);
}

export function cardClass(nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  return composeClass("node-card", nodeId, selectedId, changedRows);
}

function composeClass(base: string, nodeId: NodeId, selectedId: NodeId, changedRows: Map<NodeId, JsonChange["type"]>): string {
  const change = changedRows.get(nodeId);
  return [
    base,
    selectedId === nodeId ? "is-selected" : "",
    change === undefined ? "" : `change-${change}`,
  ].filter(Boolean).join(" ");
}
