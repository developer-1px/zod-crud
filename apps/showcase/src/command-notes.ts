import type { ApiId } from "./api-catalog.js";

export function commandNotes(api: ApiId): string {
  const notes: Partial<Record<ApiId, string>> = {
    copyMany: "Uses visible row multi-selection.",
    cutMany: "Batch cut succeeds only when selected nodes can move as one batch.",
    deleteMany: "One call, one commit, one focus result.",
    canDeleteMany: "Dry run; no document, clipboard, or history mutation.",
    canCutMany: "Facade over batch delete capability.",
    paste: "Uses clipboard from copy/copyMany/cut/cutMany.",
    subscribe: "Toggles listener registration.",
    update: "Inline edit is the primary user command; manual run uses the same call.",
  };

  return notes[api] ?? "";
}
