import type {
  Pointer,
} from "@interactive-os/json-document";

import type {
  CommentError,
  CommentErrorCode,
} from "./types.js";

export function isEmptyText(text: string | undefined): boolean {
  return text === undefined || text.trim().length === 0;
}

export function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): CommentError {
  return commentError(code, reason ?? `comment anchor is not readable: ${pointer}`, { pointer });
}

export function notFound(id: string): CommentError {
  return commentError("not_found", `comment not found: ${id}`, { id });
}

export function commentError(
  code: CommentErrorCode,
  reason: string,
  options: {
    id?: string;
    pointer?: Pointer;
  } = {},
): CommentError {
  return { ok: false, code, reason, ...(options.id === undefined ? {} : { id: options.id }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }) };
}
