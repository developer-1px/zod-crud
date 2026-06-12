import type {
  JSONDocument,
  Pointer,
} from "@interactive-os/json-document";

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

export interface CommentState {
  nextId: number;
  comments: Map<string, Comment>;
}

export type CommentDocument<T> = JSONDocument<T>;
