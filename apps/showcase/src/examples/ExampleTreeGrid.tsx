import { useMemo, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { createJsonCrud, type JsonDoc, type NodeId } from "zod-crud";
import { useTreeGridPattern } from "@p/headless/patterns";
import type { NormalizedData } from "@p/headless";

const Schema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
});

function toNormalized(doc: JsonDoc, expanded: Set<NodeId>): NormalizedData {
  return {
    entities: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [
        n.id,
        { label: String(n.key ?? n.type) },
      ]),
    ),
    relationships: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [n.id, n.children.slice()]),
    ),
    meta: { root: [doc.rootId], expanded: [...expanded] },
  };
}

export function ExampleTreeGrid() {
  const [crud] = useState(() =>
    createJsonCrud(Schema, { name: "alpha", tags: ["a", "b"] }),
  );
  const doc = useSyncExternalStore(crud.subscribe, crud.snapshot);
  const [expanded, setExpanded] = useState<Set<NodeId>>(
    () => new Set([doc.rootId]),
  );
  const data = useMemo(() => toNormalized(doc, expanded), [doc, expanded]);

  const { treegridProps, rowProps, items } = useTreeGridPattern(
    data,
    (e) => {
      if (e.type === "expand") {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (e.open) next.add(e.id);
          else next.delete(e.id);
          return next;
        });
      }
    },
    { label: "JSON tree", colCount: 1, navigationMode: "row" },
  );

  return (
    <div {...treegridProps} className="example-treegrid">
      {items.map((it) => (
        <div key={it.id} {...rowProps(it.id)}>
          {it.label}
        </div>
      ))}
    </div>
  );
}
