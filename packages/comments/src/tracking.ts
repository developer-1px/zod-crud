import {
  trackPointer,
  type JSONDocument,
  type JSONPatchOperation,
} from "zod-crud";

import type {
  Comment,
} from "./types.js";

export function trackCommentPointers<T>(
  doc: JSONDocument<T>,
  comments: Map<string, Comment>,
  applied: ReadonlyArray<JSONPatchOperation>,
): void {
  for (const comment of comments.values()) {
    if (comment.pointer === null) continue;

    const tracked = trackPointer(comment.pointer, applied);
    if (tracked !== null && doc.exists(tracked)) {
      comment.pointer = tracked;
      comment.lost = false;
      continue;
    }

    comment.pointer = null;
    comment.lost = true;
  }
}
