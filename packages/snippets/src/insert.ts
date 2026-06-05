import type {
  JSONDocument,
  JSONDocumentPasteTarget,
} from "zod-crud";

import {
  executionFailed,
} from "./errors.js";
import {
  pasteOptions,
} from "./options.js";
import {
  canInsertSnippet,
} from "./plan.js";
import type {
  Snippet,
  SnippetInsertOptions,
  SnippetInsertResult,
} from "./types.js";

export function insertSnippet<TDocument>(
  doc: JSONDocument<TDocument>,
  snippet: Snippet,
  target: JSONDocumentPasteTarget,
  options?: SnippetInsertOptions,
): SnippetInsertResult<TDocument> {
  const plan = canInsertSnippet(doc, snippet, target, options);
  if (!plan.ok) return plan;

  const result = doc.paste(target, pasteOptions(snippet, options));
  if (!result.ok) return executionFailed(snippet.id, target, result);

  return {
    ok: true,
    id: snippet.id,
    target,
    result,
  };
}
