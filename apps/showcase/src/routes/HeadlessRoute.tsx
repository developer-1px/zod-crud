import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { createJsonCrud, type JsonDoc, type NodeId } from "zod-crud";
import { useTreeGridPattern } from "@p/headless/patterns";
import type { NormalizedData, UiEvent } from "@p/headless";
import type { JsonValue } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  items: z.array(
    z.object({ name: z.string(), done: z.boolean() }),
  ),
});

function toNormalized(doc: JsonDoc, expanded: Set<NodeId>): NormalizedData {
  return {
    entities: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [
        n.id,
        {
          label:
            n.value !== undefined
              ? `${String(n.key ?? "")} = ${JSON.stringify(n.value)}`
              : String(n.key ?? n.type),
        },
      ]),
    ),
    relationships: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [n.id, n.children.slice()]),
    ),
    meta: { root: [doc.rootId], expanded: [...expanded] },
  };
}

export function HeadlessRoute() {
  const [crud] = useState(() =>
    createJsonCrud(Schema, {
      title: "demo",
      items: [
        { name: "first", done: false },
        { name: "second", done: true },
      ],
    }),
  );
  const [doc, setDoc] = useState(() => crud.snapshot());
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const [expanded, setExpanded] = useState<Set<NodeId>>(
    () => new Set([doc.rootId]),
  );

  const data = useMemo(() => toNormalized(doc, expanded), [doc, expanded]);

  const onEvent = (e: UiEvent) => {
    switch (e.type) {
      case "expand":
        setExpanded((prev) => {
          const next = new Set(prev);
          if (e.open) next.add(e.id);
          else next.delete(e.id);
          return next;
        });
        return;
      case "insertAfter":
        crud.insertAfter(e.siblingId, e.value as JsonValue);
        return;
      case "appendChild":
        crud.appendChild(e.parentId, e.value as JsonValue);
        return;
      case "update":
        crud.update(e.id, e.value as JsonValue);
        return;
      case "remove":
        crud.delete(e.id);
        return;
      case "copy":
        crud.copy(e.id);
        return;
      case "cut":
        crud.cut(e.id);
        return;
      case "paste":
        crud.paste(e.targetId);
        return;
      case "undo":
        crud.undo();
        return;
      case "redo":
        crud.redo();
        return;
    }
  };

  const { treegridProps, rowProps, items } = useTreeGridPattern(
    data,
    onEvent,
    {
      label: "Headless wrapper route",
      multiSelectable: true,
      navigationMode: "row",
      colCount: 1,
    },
  );

  return (
    <main className="headless-route">
      <h2>Headless wrapper + onEvent → zod-crud</h2>
      <p className="hint">
        화살표/Home/End 이동, Space로 expand 토글. onEvent는 모두 zod-crud로 라우팅.
      </p>
      <div {...treegridProps} className="example-treegrid">
        {items.map((it: { id: string; label: string }) => (
          <div key={it.id} {...rowProps(it.id)}>
            {it.label}
          </div>
        ))}
      </div>
      <pre className="example-source">
        <code>{JSON.stringify(crud.toJson(), null, 2)}</code>
      </pre>
    </main>
  );
}
