import type { JSONDocument } from "@interactive-os/json-document";
import { unwrapSelection, wrapSelection } from "./operations.js";
import { canUnwrapSelection, canWrapSelection } from "./plan.js";
import type { WrapSelection, WrapSelectionAdapter } from "./types.js";

export function createWrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
): WrapSelection<TDocument> {
  return {
    canWrap: (source) => canWrapSelection(doc, adapter, source),
    wrap: (source) => wrapSelection(doc, adapter, source),
    canUnwrap: (source) => canUnwrapSelection(doc, adapter, source),
    unwrap: (source) => unwrapSelection(doc, adapter, source),
  };
}
