import { useEffect, useMemo, useState } from "react";
import { createJsonCrud, type JsonValue, type NodeId } from "zod-crud";
import { useTreePattern } from "@p/headless/patterns";
import type { UiEvent } from "@p/headless";
import { SampleSchema, sampleData } from "./sampleData.js";
import { toNormalized } from "./jsonDocAdapter.js";

export function TreeRoute() {
  const [crud] = useState(() => createJsonCrud(SampleSchema, sampleData));
  const [doc, setDoc] = useState(() => crud.snapshot());
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const [expanded, setExpanded] = useState<Set<NodeId>>(() => {
    const initial = new Set<NodeId>([doc.rootId]);
    for (const child of doc.nodes[doc.rootId]!.children) initial.add(child);
    return initial;
  });

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

  const { rootProps, itemProps, items } = useTreePattern(data, onEvent, {
    label: "Headless Tree + zod-crud",
    multiSelectable: true,
  });

  return (
    <main className="headless-route">
      <h2>useTreePattern + onEvent → zod-crud</h2>
      <p className="hint">
        화살표 ← → 로 expand/collapse + 부모/자식 이동, ↑↓로 visible siblings 이동.
      </p>
      <div className="route-grid">
        <ul {...rootProps} className="example-tree">
          {items.map((it: { id: string; label: string }) => (
            <li key={it.id} {...itemProps(it.id)}>
              {it.label}
            </li>
          ))}
        </ul>
        <pre className="example-source">
          <code>{JSON.stringify(crud.toJson(), null, 2)}</code>
        </pre>
      </div>
    </main>
  );
}
