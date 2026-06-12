import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  snippetNotFound,
} from "./errors.js";
import {
  insertSnippet,
} from "./insert.js";
import {
  canInsertSnippet,
} from "./plan.js";
import {
  createSnippetStore,
} from "./store.js";
import type {
  Snippet,
  Snippets,
} from "./types.js";

export function createSnippets<TDocument>(
  doc: JSONDocument<TDocument>,
  snippets: ReadonlyArray<Snippet>,
): Snippets<TDocument> {
  const store = createSnippetStore(snippets);

  return {
    list: store.list,
    get: store.get,
    canInsert: (id, target, options) => {
      const snippet = store.get(id);
      return snippet === null ? snippetNotFound(id) : canInsertSnippet(doc, snippet, target, options);
    },
    insert: (id, target, options) => {
      const snippet = store.get(id);
      return snippet === null ? snippetNotFound(id) : insertSnippet(doc, snippet, target, options);
    },
  };
}
