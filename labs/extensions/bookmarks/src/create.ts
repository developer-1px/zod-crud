import { type JSONDocument, type Pointer, trackPointer } from "@interactive-os/json-document";
import type { Bookmark, Bookmarks, BookmarksListener, BookmarksSnapshot } from "./types.js";

export function createBookmarks<T>(
  doc: JSONDocument<T>,
  initial: Record<string, Pointer> = {},
): Bookmarks {
  const bookmarks = new Map<string, Pointer | null>();
  const listeners = new Set<BookmarksListener>();
  let disposed = false;

  for (const [key, pointer] of Object.entries(initial)) {
    const readable = doc.at(pointer);
    bookmarks.set(key, readable.ok ? readable.path : null);
  }

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(bookmarks);
    if (before === after) return;
    emit(listeners, snapshot(bookmarks));
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0) return;
    const before = snapshotSignature(bookmarks);
    for (const [key, pointer] of bookmarks) {
      if (pointer === null) continue;
      bookmarks.set(key, trackPointer(pointer, applied));
    }
    emitIfChanged(before);
  });

  return {
    current: () => snapshot(bookmarks),
    pointerFor: (key) => bookmarks.get(key) ?? null,
    canSet(pointer) {
      const readable = doc.at(pointer);
      if (readable.ok) return { ok: true };
      return {
        ok: false,
        code: readable.code,
        ...(readable.reason !== undefined ? { reason: readable.reason } : {}),
        pointer: readable.pointer,
      };
    },
    set(key, pointer) {
      const readable = doc.at(pointer);
      if (!readable.ok) {
        return {
          ok: false,
          code: readable.code,
          ...(readable.reason !== undefined ? { reason: readable.reason } : {}),
          pointer: readable.pointer,
        };
      }

      const before = snapshotSignature(bookmarks);
      bookmarks.set(key, readable.path);
      emitIfChanged(before);
      return {
        ok: true,
        bookmark: copyBookmark({ key, pointer: readable.path, lost: false }),
      };
    },
    remove(key) {
      const before = snapshotSignature(bookmarks);
      const removed = bookmarks.delete(key);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(bookmarks);
      bookmarks.clear();
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

export function snapshot(bookmarks: ReadonlyMap<string, Pointer | null>): BookmarksSnapshot {
  const items = [...bookmarks.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, pointer]) => copyBookmark({
      key,
      pointer,
      lost: pointer === null,
    }));
  return {
    bookmarks: items,
    tracked: items.filter((bookmark) => !bookmark.lost).length,
    lost: items.filter((bookmark) => bookmark.lost).length,
  };
}

function emit(
  listeners: Set<BookmarksListener>,
  value: BookmarksSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(value: BookmarksSnapshot): BookmarksSnapshot {
  return {
    bookmarks: value.bookmarks.map(copyBookmark),
    tracked: value.tracked,
    lost: value.lost,
  };
}

function copyBookmark(bookmark: Bookmark): Bookmark {
  return {
    key: bookmark.key,
    pointer: bookmark.pointer,
    lost: bookmark.lost,
  };
}

function snapshotSignature(bookmarks: ReadonlyMap<string, Pointer | null>): string {
  return JSON.stringify([...bookmarks.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
