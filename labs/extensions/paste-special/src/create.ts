import type { JSONDocument } from "zod-crud";
import { pasteSpecial } from "./operations.js";
import { canPasteSpecial } from "./plan.js";
import type { PasteSpecial, PasteSpecialAdapter } from "./types.js";

export function createPasteSpecial<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: PasteSpecialAdapter,
): PasteSpecial<TDocument> {
  return {
    canPaste: (input) => canPasteSpecial(doc, adapter, input),
    paste: (input) => pasteSpecial(doc, adapter, input),
  };
}
