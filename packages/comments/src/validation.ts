import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  commentError,
  isEmptyText,
  readError,
} from "./errors.js";
import type {
  Comment,
  CommentError,
  CommentInput,
} from "./types.js";

export function canAdd<T>(
  doc: JSONDocument<T>,
  comments: ReadonlyMap<string, Comment>,
  input: CommentInput,
): { ok: true } | CommentError {
  if (input.id !== undefined && comments.has(input.id)) {
    return commentError("duplicate_id", `comment already exists: ${input.id}`, { id: input.id });
  }
  if (isEmptyText(input.text)) {
    return input.id === undefined
      ? commentError("empty_text", "comment text must not be empty")
      : commentError("empty_text", "comment text must not be empty", { id: input.id });
  }

  const read = doc.at(input.pointer);
  if (!read.ok) return readError(read.code, read.pointer, read.reason);
  return { ok: true };
}

export function createComment(id: string, input: CommentInput): Comment {
  return {
    id,
    pointer: input.pointer,
    text: input.text,
    status: input.status ?? "open",
    lost: false,
    ...(input.data === undefined ? {} : { data: { ...input.data } }),
  };
}
