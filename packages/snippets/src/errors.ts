import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
  JSONDocumentPasteTarget,
} from "zod-crud";

import type {
  SnippetError,
} from "./types.js";

export function snippetNotFound(id: string): SnippetError {
  return {
    ok: false,
    code: "snippet_not_found",
    reason: `snippet not found: ${id}`,
    id,
  };
}

export function disabled(
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

export function executionFailed<TDocument>(
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
