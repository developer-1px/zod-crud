import { useEffect, useMemo, useState } from "react";
import { createJsonCrud, type JsonValue, type NodeId } from "zod-crud";
import { useTreeGridPattern } from "@p/headless/patterns";
import type { UiEvent } from "@p/headless";
import { SampleSchema, sampleData } from "./sampleData.js";
import { toNormalized } from "./jsonDocAdapter.js";
import { RouteLayout, TreeNode } from "./RouteLayout.js";

export function HeadlessRoute() {
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

  const { treegridProps, rowProps, items } = useTreeGridPattern(
    data,
    onEvent,
    {
      label: "Headless TreeGrid + zod-crud",
      multiSelectable: true,
      navigationMode: "row",
      colCount: 1,
    },
  );

  return (
    <RouteLayout
      title="useTreeGridPattern"
      hint="화살표 / Home·End / Space·Right로 expand / Shift+화살표 range select. onEvent → zod-crud."
      tree={
        <div {...treegridProps} className="tree">
          {items.map((it) => (
            <div key={it.id} {...rowProps(it.id)} className="tree__row">
              <TreeNode
                label={it.label}
                level={it.level}
                hasChildren={it.hasChildren}
                expanded={it.expanded}
              />
            </div>
          ))}
        </div>
      }
      json={JSON.stringify(crud.toJson(), null, 2)}
    />
  );
}
