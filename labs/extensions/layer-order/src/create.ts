import type { JSONDocument } from "zod-crud";
import { reorderLayers } from "./operations.js";
import { canReorderLayers } from "./plan.js";
import type { LayerOrder } from "./types.js";

export function createLayerOrder<TDocument>(
  doc: JSONDocument<TDocument>,
): LayerOrder<TDocument> {
  return {
    canReorder: (source, action) => canReorderLayers(doc, source, action),
    reorder: (source, action) => reorderLayers(doc, source, action),
    canBringForward: (source) => canReorderLayers(doc, source, "bringForward"),
    bringForward: (source) => reorderLayers(doc, source, "bringForward"),
    canBringToFront: (source) => canReorderLayers(doc, source, "bringToFront"),
    bringToFront: (source) => reorderLayers(doc, source, "bringToFront"),
    canSendBackward: (source) => canReorderLayers(doc, source, "sendBackward"),
    sendBackward: (source) => reorderLayers(doc, source, "sendBackward"),
    canSendToBack: (source) => canReorderLayers(doc, source, "sendToBack"),
    sendToBack: (source) => reorderLayers(doc, source, "sendToBack"),
  };
}
