import type {
  Comment,
  CommentSnapshot,
} from "./types.js";

export function copySnapshot(value: CommentSnapshot): CommentSnapshot {
  return {
    comments: value.comments.map(copyComment),
    open: value.open,
    resolved: value.resolved,
    lost: value.lost,
  };
}

export function copyComment(comment: Comment): Comment {
  return {
    id: comment.id,
    pointer: comment.pointer,
    text: comment.text,
    status: comment.status,
    lost: comment.lost,
    ...(comment.data === undefined ? {} : { data: { ...comment.data } }),
  };
}

export function list(comments: ReadonlyMap<string, Comment>): Comment[] {
  return [...comments.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function snapshotSignature(comments: ReadonlyMap<string, Comment>): string {
  return JSON.stringify(list(comments));
}
