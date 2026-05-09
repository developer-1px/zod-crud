import type { Dispatch, SetStateAction } from "react";
import type { UiEvent } from "@p/aria-kernel";
import type { JsonCrud, JsonValue, NodeId } from "zod-crud";

type PasteRouteOptions = {
  mode?: NonNullable<Extract<UiEvent, { type: "paste" }>["mode"]>;
  index?: number;
};

type CrudEventContext = {
  crud: JsonCrud;
  setExpanded: Dispatch<SetStateAction<Set<NodeId>>>;
  setSelected: Dispatch<SetStateAction<Set<NodeId>>>;
};

function pasteOptionsFor(event: Extract<UiEvent, { type: "paste" }>): PasteRouteOptions {
  const options: PasteRouteOptions = {};

  if (event.mode !== undefined) options.mode = event.mode;
  if (event.index !== undefined) options.index = event.index;

  return options;
}

export function handleJsonDocCrudEvent(event: UiEvent, context: CrudEventContext) {
  const { crud, setExpanded, setSelected } = context;

  switch (event.type) {
    case "insertAfter":
      crud.insertAfter(event.siblingId, event.value as JsonValue);
      return true;
    case "appendChild":
      crud.appendChild(event.parentId, event.value as JsonValue);
      setExpanded((current) => new Set(current).add(event.parentId));
      return true;
    case "update":
      crud.update(event.id, event.value as JsonValue);
      return true;
    case "remove":
      crud.delete(event.id);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
      return true;
    case "copy":
      crud.copy(event.id);
      return true;
    case "cut":
      crud.cut(event.id);
      return true;
    case "paste":
      crud.paste(event.targetId, pasteOptionsFor(event));
      return true;
    case "undo":
      crud.undo();
      return true;
    case "redo":
      crud.redo();
      return true;
    default:
      return false;
  }
}
