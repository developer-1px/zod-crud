import type {
  Snippet,
  SnippetInsertOptions,
} from "./types.js";

export function copySnippet(snippet: Snippet): Snippet {
  return {
    id: snippet.id,
    payload: copyPayload(snippet.payload),
    ...(snippet.label === undefined ? {} : { label: snippet.label }),
    ...(snippet.options === undefined ? {} : { options: copyPayload(snippet.options) as SnippetInsertOptions }),
  };
}

export function copyOptions(options: SnippetInsertOptions | undefined): SnippetInsertOptions | undefined {
  if (options === undefined) return undefined;
  return copyPayload(options) as SnippetInsertOptions;
}

export function copyPayload(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
