import type { NodeId } from "zod-crud";

import type { GridRow } from "./grid-rows.js";

export function visibleRangeIds(rows: GridRow[], anchorId: NodeId, activeId: NodeId): NodeId[] {
  const anchorIndex = rows.findIndex((row) => row.id === anchorId);
  const activeIndex = rows.findIndex((row) => row.id === activeId);

  if (anchorIndex < 0 || activeIndex < 0) {
    return [];
  }

  const start = Math.min(anchorIndex, activeIndex);
  const end = Math.max(anchorIndex, activeIndex);

  return rows.slice(start, end + 1).map((row) => row.id);
}
