import {
  copySnippet,
} from "./copy.js";
import type {
  Snippet,
  SnippetSummary,
} from "./types.js";

export interface SnippetStore {
  list(): ReadonlyArray<SnippetSummary>;
  get(id: string): Snippet | null;
}

export function createSnippetStore(snippets: ReadonlyArray<Snippet>): SnippetStore {
  const byId = new Map(snippets.map((snippet) => [snippet.id, copySnippet(snippet)]));
  return {
    list: () => [...byId.values()].map(({ id, label }) => label === undefined ? { id } : { id, label }),
    get: (id) => {
      const snippet = byId.get(id);
      return snippet === undefined ? null : copySnippet(snippet);
    },
  };
}
