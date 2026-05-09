import type { Dispatch, SetStateAction } from "react";
import type { UiEvent } from "@p/aria-kernel";
import type { JsonDoc, NodeId } from "zod-crud";
import { selectedAfterSelect, selectedRange } from "./jsonDocRouteSelection.js";
import { expandableNodeIds, visibleNodeIds } from "./jsonDocTreeIds.js";

type ViewEventContext = {
  doc: JsonDoc;
  expanded: Set<NodeId>;
  focus: NodeId | null;
  selectAnchor: NodeId | null;
  setExpanded: Dispatch<SetStateAction<Set<NodeId>>>;
  setFocus: Dispatch<SetStateAction<NodeId | null>>;
  setSelected: Dispatch<SetStateAction<Set<NodeId>>>;
  setSelectAnchor: Dispatch<SetStateAction<NodeId | null>>;
};

export function handleJsonDocViewEvent(event: UiEvent, context: ViewEventContext) {
  const {
    doc,
    expanded,
    focus,
    selectAnchor,
    setExpanded,
    setFocus,
    setSelected,
    setSelectAnchor,
  } = context;

  switch (event.type) {
    case "navigate":
      if (event.id) setFocus(event.id);
      return true;
    case "focus":
      setFocus(event.id);
      return true;
    case "select": {
      setSelected((current) => selectedAfterSelect(event, current));
      const nextAnchor = event.ids.at(-1) ?? null;
      if (nextAnchor) setFocus(nextAnchor);
      if (event.anchor) setSelectAnchor(nextAnchor);
      return true;
    }
    case "selectAll":
      setSelected(new Set(visibleNodeIds(doc, expanded)));
      return true;
    case "selectNone":
      setSelected(new Set());
      return true;
    case "selectRange": {
      const anchor = selectAnchor ?? focus ?? event.to;
      setSelected(selectedRange(doc, expanded, anchor, event.to));
      setFocus(event.to);
      setSelectAnchor(anchor);
      return true;
    }
    case "expand":
      setExpanded((current) => {
        const next = new Set(current);
        if (event.open) next.add(event.id);
        else next.delete(event.id);
        return next;
      });
      return true;
    case "expandAll":
      setExpanded((current) => {
        const next = new Set(current);
        for (const id of expandableNodeIds(doc, event.id)) {
          next.add(id);
        }
        return next;
      });
      return true;
    case "collapseAll":
      setExpanded((current) => {
        const next = event.id ? new Set(current) : new Set<NodeId>([doc.rootId]);
        for (const id of expandableNodeIds(doc, event.id)) {
          next.delete(id);
        }
        if (event.id === undefined) next.add(doc.rootId);
        return next;
      });
      return true;
    default:
      return false;
  }
}
