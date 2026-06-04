import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  Pointer,
} from "zod-crud";

export type SnippetInsertOptions = Omit<JSONDocumentPasteOptions, "payload">;

export interface Snippet {
  id: string;
  payload: unknown;
  label?: string;
  options?: SnippetInsertOptions;
}

export interface SnippetSummary {
  id: string;
  label?: string;
}

export type SnippetErrorCode =
  | "snippet_not_found"
  | "disabled"
  | "execution_failed";

export interface SnippetError {
  ok: false;
  code: SnippetErrorCode;
  reason: string;
  id?: string;
  target?: JSONDocumentPasteTarget;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<ClipboardPasteResult<unknown>, { ok: true }>;
}

export interface SnippetPlan {
  ok: true;
  id: string;
  target: JSONDocumentPasteTarget;
  capability: { ok: true };
}

export type SnippetPlanResult =
  | SnippetPlan
  | SnippetError;

export type SnippetInsertResult<TDocument> =
  | {
      ok: true;
      id: string;
      target: JSONDocumentPasteTarget;
      result: ClipboardPasteResult<TDocument>;
    }
  | SnippetError;

export interface Snippets<TDocument> {
  list(): ReadonlyArray<SnippetSummary>;
  get(id: string): Snippet | null;
  canInsert(id: string, target: JSONDocumentPasteTarget, options?: SnippetInsertOptions): SnippetPlanResult;
  insert(id: string, target: JSONDocumentPasteTarget, options?: SnippetInsertOptions): SnippetInsertResult<TDocument>;
}

export function createSnippets<TDocument>(
  doc: JSONDocument<TDocument>,
  snippets: ReadonlyArray<Snippet>,
): Snippets<TDocument> {
  const byId = new Map(snippets.map((snippet) => [snippet.id, copySnippet(snippet)]));

  return {
    list: () => [...byId.values()].map(({ id, label }) => label === undefined ? { id } : { id, label }),
    get: (id) => {
      const snippet = byId.get(id);
      return snippet === undefined ? null : copySnippet(snippet);
    },
    canInsert: (id, target, options) => {
      const snippet = byId.get(id);
      return snippet === undefined ? snippetNotFound(id) : canInsertSnippet(doc, snippet, target, options);
    },
    insert: (id, target, options) => {
      const snippet = byId.get(id);
      return snippet === undefined ? snippetNotFound(id) : insertSnippet(doc, snippet, target, options);
    },
  };
}

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

function pasteOptions(
  snippet: Snippet,
  options?: SnippetInsertOptions,
): JSONDocumentPasteOptions {
  return {
    ...copyOptions(snippet.options),
    ...copyOptions(options),
    payload: copyPayload(snippet.payload),
  };
}

function copySnippet(snippet: Snippet): Snippet {
  return {
    id: snippet.id,
    payload: copyPayload(snippet.payload),
    ...(snippet.label === undefined ? {} : { label: snippet.label }),
    ...(snippet.options === undefined ? {} : { options: copyPayload(snippet.options) as SnippetInsertOptions }),
  };
}

function copyOptions(options: SnippetInsertOptions | undefined): SnippetInsertOptions | undefined {
  if (options === undefined) return undefined;
  return copyPayload(options) as SnippetInsertOptions;
}

function copyPayload(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function snippetNotFound(id: string): SnippetError {
  return {
    ok: false,
    code: "snippet_not_found",
    reason: `snippet not found: ${id}`,
    id,
  };
}

function disabled(
  id: string,
  target: JSONDocumentPasteTarget,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): SnippetError {
  const error: SnippetError = {
    ok: false,
    code: "disabled",
    reason: capability.reason ?? "snippet insert is disabled",
    id,
    target,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function executionFailed<TDocument>(
  id: string,
  target: JSONDocumentPasteTarget,
  result: Exclude<ClipboardPasteResult<TDocument>, { ok: true }>,
): SnippetError {
  return {
    ok: false,
    code: "execution_failed",
    reason: "snippet insert failed",
    id,
    target,
    result: result as Exclude<ClipboardPasteResult<unknown>, { ok: true }>,
  };
}
