import type {
  JSONDocumentPasteOptions,
} from "@interactive-os/json-document";

import {
  copyOptions,
  copyPayload,
} from "./copy.js";
import type {
  Snippet,
  SnippetInsertOptions,
} from "./types.js";

export function pasteOptions(
  snippet: Snippet,
  options?: SnippetInsertOptions,
): JSONDocumentPasteOptions {
  return {
    ...copyOptions(snippet.options),
    ...copyOptions(options),
    payload: copyPayload(snippet.payload),
  };
}
