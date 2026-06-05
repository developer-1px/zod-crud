import {
  copyComment,
  copySnapshot,
  list,
} from "./copy.js";
import {
  matchesFilter,
} from "./filter.js";
import type {
  Comment,
  CommentFilter,
  CommentListener,
  CommentSnapshot,
} from "./types.js";

export function snapshot(
  comments: ReadonlyMap<string, Comment>,
  filter: CommentFilter = {},
): CommentSnapshot {
  const all = list(comments).map(copyComment);
  const visible = all.filter((comment) => matchesFilter(comment, filter));
  return {
    comments: visible,
    open: all.filter((comment) => comment.status === "open").length,
    resolved: all.filter((comment) => comment.status === "resolved").length,
    lost: all.filter((comment) => comment.lost).length,
  };
}

export function emit(
  listeners: Set<CommentListener>,
  value: CommentSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}
