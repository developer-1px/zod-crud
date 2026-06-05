import type { PasteOptions } from "../../../domain/clipboard/paste.js";
import type { JSONDocumentPasteOptions } from "./types.js";

export function splitPasteOptions(options?: JSONDocumentPasteOptions):
  | { kind: "clipboard"; options?: PasteOptions }
  | { kind: "payload"; payload: unknown; options?: PasteOptions } {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "payload")) {
    return options === undefined ? { kind: "clipboard" } : { kind: "clipboard", options };
  }
  const { payload, ...pasteOptions } = options;
  return Object.keys(pasteOptions).length === 0
    ? { kind: "payload", payload }
    : { kind: "payload", payload, options: pasteOptions };
}
