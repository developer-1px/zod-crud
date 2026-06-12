import type { Pointer } from "@interactive-os/json-document";

export type BookmarkErrorCode =
  | "invalid_pointer"
  | "path_not_found";

export interface BookmarkError {
  ok: false;
  code: BookmarkErrorCode;
  reason?: string;
  pointer: Pointer;
}

export interface Bookmark {
  key: string;
  pointer: Pointer | null;
  lost: boolean;
}

export interface BookmarksSnapshot {
  bookmarks: ReadonlyArray<Bookmark>;
  tracked: number;
  lost: number;
}

export type BookmarkSetResult =
  | { ok: true; bookmark: Bookmark }
  | BookmarkError;

export type BookmarksListener = (snapshot: BookmarksSnapshot) => void;

export interface Bookmarks {
  current(): BookmarksSnapshot;
  pointerFor(key: string): Pointer | null;
  canSet(pointer: Pointer): { ok: true } | BookmarkError;
  set(key: string, pointer: Pointer): BookmarkSetResult;
  remove(key: string): boolean;
  clear(): void;
  subscribe(listener: BookmarksListener): () => void;
  dispose(): void;
}
