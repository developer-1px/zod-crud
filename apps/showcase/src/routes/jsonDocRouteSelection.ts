import type { UiEvent } from "@p/aria-kernel";
import type { JsonDoc, NodeId } from "zod-crud";
import { visibleNodeIds } from "./jsonDocTreeIds.js";

export function selectedAfterSelect(
  event: Extract<UiEvent, { type: "select" }>,
  current: Set<NodeId>,
) {
  if (event.to === undefined) {
    return new Set(event.ids);
  }

  const next = new Set(current);
  for (const id of event.ids) {
    if (event.to) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function selectedRange(
  doc: JsonDoc,
  expanded: Set<NodeId>,
  from: NodeId | null,
  to: NodeId,
): Set<NodeId> {
  const ids = visibleNodeIds(doc, expanded);
  const fromIndex = from ? ids.indexOf(from) : -1;
  const toIndex = ids.indexOf(to);

  if (fromIndex < 0 || toIndex < 0) {
    return new Set([to]);
  }

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return new Set(ids.slice(start, end + 1));
}
