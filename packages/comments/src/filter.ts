import type {
  Pointer,
} from "zod-crud";

import type {
  Comment,
  CommentFilter,
  CommentPointerFilter,
} from "./types.js";

export function matchesFilter(comment: Comment, filter: CommentFilter): boolean {
  if (filter.status !== undefined && filter.status !== "all" && comment.status !== filter.status) {
    return false;
  }
  if (filter.lost !== undefined && filter.lost !== "all" && comment.lost !== filter.lost) {
    return false;
  }
  return true;
}

export function matchesPointer(
  comment: Comment,
  pointer: Pointer,
  filter: CommentPointerFilter,
): boolean {
  if (comment.pointer === null) return false;
  if (comment.status === "resolved" && filter.includeResolved !== true) return false;
  if (comment.pointer === pointer) return true;
  if (filter.includeDescendants !== true) return false;
  return pointer === "" ? comment.pointer !== "" : comment.pointer.startsWith(`${pointer}/`);
}
