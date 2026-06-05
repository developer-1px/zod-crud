import {
  copyComment,
  snapshotSignature,
} from "./copy.js";
import {
  notFound,
} from "./errors.js";
import {
  emit,
  snapshot,
} from "./snapshot.js";
import type {
  Comment,
  CommentListener,
  CommentResult,
  CommentStatus,
} from "./types.js";

export function setStatus(
  comments: Map<string, Comment>,
  listeners: Set<CommentListener>,
  id: string,
  status: CommentStatus,
): CommentResult {
  const comment = comments.get(id);
  if (comment === undefined) return notFound(id);

  const before = snapshotSignature(comments);
  comment.status = status;
  const after = snapshotSignature(comments);
  if (before !== after) emit(listeners, snapshot(comments));
  return { ok: true, comment: copyComment(comment) };
}
