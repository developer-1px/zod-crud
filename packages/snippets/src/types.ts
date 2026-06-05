import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
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
