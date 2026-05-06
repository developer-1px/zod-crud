import { useEffect, useMemo, useState } from "react";
import { createJsonCrud, type JsonValue, type NodeId } from "zod-crud";
import { useTreePattern } from "@p/headless/patterns";
import type { UiEvent } from "@p/headless";
import { SampleSchema, sampleData } from "./sampleData.js";
import { toNormalized } from "./jsonDocAdapter.js";
import { RouteLayout, TreeNode } from "./RouteLayout.js";

export function TreeRoute() {
  const [crud] = useState(() => createJsonCrud(SampleSchema, sampleData));
  const [doc, setDoc] = useState(() => crud.snapshot());
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const [expanded, setExpanded] = useState<Set<NodeId>>(() => {
    const initial = new Set<NodeId>([doc.rootId]);
    for (const child of doc.nodes[doc.rootId]!.children) initial.add(child);
    return initial;
  });
  const [focus, setFocus] = useState<NodeId | null>(doc.rootId);
  const [selected, setSelected] = useState<Set<NodeId>>(() => new Set());

  const data = useMemo(
    () => toNormalized(doc, expanded, focus, selected),
    [doc, expanded, focus, selected],
  );

  const onEvent = (e: UiEvent) => {
    switch (e.type) {
      case "navigate":
        if (e.id) setFocus(e.id);
        return;
      case "select":
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(e.id)) next.delete(e.id);
          else next.add(e.id);
          return next;
        });
        setFocus(e.id);
        return;
      case "selectMany":
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of e.ids) {
            if (e.to === undefined) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            } else if (e.to) next.add(id);
            else next.delete(id);
          }
          return next;
        });
        return;
      case "setAnchor":
        return;
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
    <RouteLayout
      title="useTreePattern"
      hint="←/→로 expand·collapse + 부모/자식 이동, ↑↓로 visible siblings 이동."
      tree={
        <ul {...rootProps} className="tree">
          {items.map((it) => (
            <li key={it.id} {...itemProps(it.id)} className="tree__row">
              <TreeNode
                label={it.label}
                level={it.level}
                hasChildren={it.hasChildren}
                expanded={it.expanded}
              />
            </li>
          ))}
        </ul>
      }
      json={JSON.stringify(crud.toJson(), null, 2)}
    />
  );
}
