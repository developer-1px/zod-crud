import {
  trackPointer,
  type JSONDocument,
  type Pointer,
} from "zod-crud";

export type CommentStatus = "open" | "resolved";

export type CommentErrorCode =
  | "duplicate_id"
  | "empty_text"
  | "invalid_pointer"
  | "not_found"
  | "path_not_found";

export interface CommentError {
  ok: false;
  code: CommentErrorCode;
  reason: string;
  pointer?: Pointer;
  id?: string;
}

export interface Comment {
  id: string;
  pointer: Pointer | null;
  text: string;
  status: CommentStatus;
  lost: boolean;
  data?: Readonly<Record<string, unknown>>;
}

export interface CommentInput {
  id?: string;
  pointer: Pointer;
  text: string;
  status?: CommentStatus;
  data?: Readonly<Record<string, unknown>>;
}

export interface CommentUpdate {
  pointer?: Pointer;
  text?: string;
  status?: CommentStatus;
  data?: Readonly<Record<string, unknown>> | null;
}

export interface CommentFilter {
  status?: CommentStatus | "all";
  lost?: boolean | "all";
}

export interface CommentPointerFilter {
  includeResolved?: boolean;
  includeDescendants?: boolean;
}

export interface CommentSnapshot {
  comments: ReadonlyArray<Comment>;
  open: number;
  resolved: number;
  lost: number;
}

export type CommentResult =
  | { ok: true; comment: Comment }
  | CommentError;

export type CommentListResult =
  | { ok: true; comments: ReadonlyArray<Comment> }
  | CommentError;

export type CommentListener = (snapshot: CommentSnapshot) => void;

export interface Comments {
  current(filter?: CommentFilter): CommentSnapshot;
  byId(id: string): Comment | null;
  forPointer(pointer: Pointer, filter?: CommentPointerFilter): CommentListResult;
  canAdd(input: CommentInput): { ok: true } | CommentError;
  add(input: CommentInput): CommentResult;
  update(id: string, patch: CommentUpdate): CommentResult;
  resolve(id: string): CommentResult;
  reopen(id: string): CommentResult;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: CommentListener): () => void;
  dispose(): void;
}

interface CommentState {
  nextId: number;
  comments: Map<string, Comment>;
}

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
    for (const comment of state.comments.values()) {
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
    emitIfChanged(before);
  });

  return {
    current(filter = {}) {
      return snapshot(state.comments, filter);
    },
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
    canAdd(input) {
      return canAdd(doc, state.comments, input);
    },
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
    resolve(id) {
      return setStatus(state.comments, listeners, id, "resolved");
    },
    reopen(id) {
      return setStatus(state.comments, listeners, id, "open");
    },
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

function canAdd<T>(
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

function createComment(id: string, input: CommentInput): Comment {
  const comment: Comment = {
    id,
    pointer: input.pointer,
    text: input.text,
    status: input.status ?? "open",
    lost: false,
  };
  if (input.data !== undefined) comment.data = { ...input.data };
  return comment;
}

function setStatus(
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

function snapshot(
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

function list(comments: ReadonlyMap<string, Comment>): Comment[] {
  return [...comments.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function matchesFilter(comment: Comment, filter: CommentFilter): boolean {
  if (filter.status !== undefined && filter.status !== "all" && comment.status !== filter.status) {
    return false;
  }
  if (filter.lost !== undefined && filter.lost !== "all" && comment.lost !== filter.lost) {
    return false;
  }
  return true;
}

function matchesPointer(
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

function emit(
  listeners: Set<CommentListener>,
  value: CommentSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(value: CommentSnapshot): CommentSnapshot {
  return {
    comments: value.comments.map(copyComment),
    open: value.open,
    resolved: value.resolved,
    lost: value.lost,
  };
}

function copyComment(comment: Comment): Comment {
  const copy: Comment = {
    id: comment.id,
    pointer: comment.pointer,
    text: comment.text,
    status: comment.status,
    lost: comment.lost,
  };
  if (comment.data !== undefined) copy.data = { ...comment.data };
  return copy;
}

function snapshotSignature(comments: ReadonlyMap<string, Comment>): string {
  return JSON.stringify(list(comments));
}

function nextCommentId(state: CommentState): string {
  let id = "";
  do {
    id = `comment-${state.nextId}`;
    state.nextId += 1;
  } while (state.comments.has(id));
  return id;
}

function isEmptyText(text: string | undefined): boolean {
  return text === undefined || text.trim().length === 0;
}

function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): CommentError {
  return commentError(code, reason ?? `comment anchor is not readable: ${pointer}`, { pointer });
}

function notFound(id: string): CommentError {
  return commentError("not_found", `comment not found: ${id}`, { id });
}

function commentError(
  code: CommentErrorCode,
  reason: string,
  options: {
    id?: string;
    pointer?: Pointer;
  } = {},
): CommentError {
  const error: CommentError = { ok: false, code, reason };
  if (options.id !== undefined) error.id = options.id;
  if (options.pointer !== undefined) error.pointer = options.pointer;
  return error;
}
