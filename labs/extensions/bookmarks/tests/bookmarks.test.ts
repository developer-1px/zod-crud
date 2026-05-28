import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createBookmarks } from "../src/index.js";

const Item = z.object({
  id: z.string(),
  title: z.string(),
});
const Schema = z.object({
  items: z.array(Item),
  meta: z.object({
    title: z.string(),
  }),
});

function createDoc() {
  return createJSONDocument(Schema, {
    items: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
    meta: {
      title: "List",
    },
  });
}

describe("@zod-crud/bookmarks", () => {
  test("tracks bookmarked pointers across array insertions and removals", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc, {
      bTitle: "/items/1/title",
      metaTitle: "/meta/title",
    });

    expect(doc.insert("/items/0", { id: "x", title: "X" })).toEqual({ ok: true });
    expect(bookmarks.pointerFor("bTitle")).toBe("/items/2/title");
    expect(bookmarks.pointerFor("metaTitle")).toBe("/meta/title");

    expect(doc.delete("/items/0")).toEqual({ ok: true });
    expect(bookmarks.pointerFor("bTitle")).toBe("/items/1/title");
  });

  test("marks bookmarks as lost when a containing value is removed or replaced", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc, {
      title: "/items/1/title",
      item: "/items/2",
    });

    expect(doc.delete("/items/1")).toEqual({ ok: true });
    expect(bookmarks.current()).toEqual({
      bookmarks: [
        { key: "item", pointer: "/items/1", lost: false },
        { key: "title", pointer: null, lost: true },
      ],
      tracked: 1,
      lost: 1,
    });

    expect(doc.replace("/items", [])).toEqual({ ok: true });
    expect(bookmarks.current()).toEqual({
      bookmarks: [
        { key: "item", pointer: null, lost: true },
        { key: "title", pointer: null, lost: true },
      ],
      tracked: 0,
      lost: 2,
    });
  });

  test("tracks moved subtrees without stable identity lookup", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc, {
      nested: "/items/0/title",
      sibling: "/items/2/title",
    });

    expect(doc.move("/items/0", "/items/-")).toEqual({ ok: true });

    expect(bookmarks.pointerFor("nested")).toBe("/items/2/title");
    expect(bookmarks.pointerFor("sibling")).toBe("/items/1/title");
  });

  test("validates targets before storing them", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc);

    expect(bookmarks.canSet("/items/0/title")).toEqual({ ok: true });
    expect(bookmarks.set("title", "/items/0/title")).toEqual({
      ok: true,
      bookmark: { key: "title", pointer: "/items/0/title", lost: false },
    });
    expect(bookmarks.set("missing", "/items/9/title")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/items/9/title",
    });
    expect(bookmarks.set("bad", "not/a/pointer")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "not/a/pointer",
    });
  });

  test("emits snapshots for bookmark changes and document tracking changes", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc);
    const listener = vi.fn();

    bookmarks.subscribe(listener);
    bookmarks.set("title", "/items/1/title");
    doc.insert("/items/0", { id: "x", title: "X" });
    bookmarks.remove("title");

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      {
        bookmarks: [{ key: "title", pointer: "/items/1/title", lost: false }],
        tracked: 1,
        lost: 0,
      },
      {
        bookmarks: [{ key: "title", pointer: "/items/2/title", lost: false }],
        tracked: 1,
        lost: 0,
      },
      {
        bookmarks: [],
        tracked: 0,
        lost: 0,
      },
    ]);
  });

  test("dispose stops document-driven tracking", () => {
    const doc = createDoc();
    const bookmarks = createBookmarks(doc, {
      title: "/items/1/title",
    });

    bookmarks.dispose();
    expect(doc.insert("/items/0", { id: "x", title: "X" })).toEqual({ ok: true });

    expect(bookmarks.pointerFor("title")).toBe("/items/1/title");
  });
});
