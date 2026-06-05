import type {
  JSONDocument,
  JSONDocumentPasteTarget,
} from "zod-crud";

import {
  disabled,
} from "./errors.js";
import {
  pasteOptions,
} from "./options.js";
import type {
  Snippet,
  SnippetInsertOptions,
  SnippetPlanResult,
} from "./types.js";

export function canInsertSnippet<TDocument>(
  doc: JSONDocument<TDocument>,
  snippet: Snippet,
  target: JSONDocumentPasteTarget,
  options?: SnippetInsertOptions,
): SnippetPlanResult {
  const capability = doc.canPaste(target, pasteOptions(snippet, options));
  if (!capability.ok) return disabled(snippet.id, target, capability);

  return {
    ok: true,
    id: snippet.id,
    target,
    capability,
  };
}
