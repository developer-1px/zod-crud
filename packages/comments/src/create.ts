import type {
  JSONDocument,
} from "zod-crud";

import {
  copyComment,
  list,
  snapshotSignature,
} from "./copy.js";
import {
  commentError,
  isEmptyText,
  notFound,
  readError,
} from "./errors.js";
import {
  matchesPointer,
} from "./filter.js";
import {
  emit,
  snapshot,
} from "./snapshot.js";
import {
  setStatus,
} from "./status.js";
import {
  trackCommentPointers,
} from "./tracking.js";
import {
  canAdd,
  createComment,
} from "./validation.js";
import type {
  CommentListener,
  CommentState,
  Comments,
} from "./types.js";

export function createComments<T>(doc: JSONDocument<T>): Comments {
  const state: CommentState = {
    nextId: 1,
    comments: new Map(),
  };
  const listeners = new Set<CommentListener>();
  let disposed = false;

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(state.comments);
    if (before === after) return;
    emit(listeners, snapshot(state.comments));
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0 || state.comments.size === 0) return;

    const before = snapshotSignature(state.comments);
    trackCommentPointers(doc, state.comments, applied);
    emitIfChanged(before);
  });

  return {
    current: (filter = {}) => snapshot(state.comments, filter),
    byId(id) {
      const comment = state.comments.get(id);
      return comment === undefined ? null : copyComment(comment);
    },
    forPointer(pointer, filter = {}) {
      const read = doc.at(pointer);
      if (!read.ok) return readError(read.code, read.pointer, read.reason);

      const comments = list(state.comments)
        .filter((comment) => matchesPointer(comment, pointer, filter))
        .map(copyComment);
      return { ok: true, comments };
    },
    canAdd: (input) => canAdd(doc, state.comments, input),
    add(input) {
      const capability = canAdd(doc, state.comments, input);
      if (!capability.ok) return capability;

      const before = snapshotSignature(state.comments);
      const id = input.id ?? nextCommentId(state);
      const comment = createComment(id, input);
      state.comments.set(id, comment);
      emitIfChanged(before);
      return { ok: true, comment: copyComment(comment) };
    },
    update(id, patch) {
      const comment = state.comments.get(id);
      if (comment === undefined) return notFound(id);

      if (Object.hasOwn(patch, "text") && isEmptyText(patch.text)) {
        return commentError("empty_text", "comment text must not be empty", { id });
      }

      if (patch.pointer !== undefined) {
        const read = doc.at(patch.pointer);
        if (!read.ok) return readError(read.code, read.pointer, read.reason);
      }

      const before = snapshotSignature(state.comments);
      if (patch.pointer !== undefined) {
        comment.pointer = patch.pointer;
        comment.lost = false;
      }
      if (patch.text !== undefined) comment.text = patch.text;
      if (patch.status !== undefined) comment.status = patch.status;
      if (Object.hasOwn(patch, "data")) {
        if (patch.data === null) {
          delete comment.data;
        } else if (patch.data !== undefined) {
          comment.data = { ...patch.data };
        }
      }
      emitIfChanged(before);
      return { ok: true, comment: copyComment(comment) };
    },
    resolve: (id) => setStatus(state.comments, listeners, id, "resolved"),
    reopen: (id) => setStatus(state.comments, listeners, id, "open"),
    remove(id) {
      const before = snapshotSignature(state.comments);
      const removed = state.comments.delete(id);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(state.comments);
      state.comments.clear();
      emitIfChanged(before);
    },
    subscribe(listener) {
      if (disposed) return () => {};

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function nextCommentId(state: CommentState): string {
  let id = "";
  do {
    id = `comment-${state.nextId}`;
    state.nextId += 1;
  } while (state.comments.has(id));
  return id;
}
