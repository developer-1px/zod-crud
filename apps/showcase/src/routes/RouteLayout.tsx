import type { ReactNode } from "react";

export function RouteLayout({
  title,
  hint,
  tree,
  json,
}: {
  title: string;
  hint: string;
  tree: ReactNode;
  json: string;
}) {
  return (
    <main className="route">
      <header className="route__header">
        <h2 className="route__title">{title}</h2>
        <p className="route__hint">{hint}</p>
      </header>
      <div className="route__body">
        <section className="route__tree" aria-label="Tree view">
          {tree}
        </section>
        <section className="route__json" aria-label="JSON output">
          <pre>
            <code>{json}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}

export function TreeNode({
  label,
  level,
  hasChildren,
  expanded,
}: {
  label: string;
  level: number;
  hasChildren: boolean;
  expanded: boolean;
}) {
  return (
    <span className="node" style={{ paddingInlineStart: `${level * 14}px` }}>
      <span className="node__twisty" aria-hidden>
        {hasChildren ? (expanded ? "▾" : "▸") : ""}
      </span>
      <span className="node__label">{label}</span>
    </span>
  );
}
