import type { JsonDoc, NodeId } from "zod-crud";
import type { NormalizedData } from "@p/aria-kernel";

export function toNormalized(
  doc: JsonDoc,
  expanded: Set<NodeId>,
  focus: NodeId | null,
  selected: Set<NodeId>,
): NormalizedData {
  return {
    entities: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [
        n.id,
        {
          label:
            n.value !== undefined
              ? `${String(n.key ?? "")}: ${JSON.stringify(n.value)}`
              : `${String(n.key ?? "")} (${n.type})`,
          selected: selected.has(n.id),
        },
      ]),
    ),
    relationships: Object.fromEntries(
      Object.values(doc.nodes).map((n) => [n.id, n.children.slice()]),
    ),
    meta: { root: [doc.rootId], expanded: [...expanded], focus },
  };
}
