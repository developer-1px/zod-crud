import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createAnnotations } from "../src/index.js";

const Item = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
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
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
      { id: "c", title: "C", done: true },
    ],
    meta: {
      title: "Board",
    },
  });
}

describe("@zod-crud/annotations", () => {
  test("adds annotations only for valid live pointers", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);

    expect(annotations.canAdd({
      id: "review-1",
      pointer: "/items/0/title",
      text: "Needs a clearer title",
    })).toEqual({ ok: true });

    expect(annotations.add({
      id: "review-1",
      pointer: "/items/0/title",
      text: "Needs a clearer title",
      data: { author: "Ada" },
    })).toEqual({
      ok: true,
      annotation: {
        id: "review-1",
        pointer: "/items/0/title",
        text: "Needs a clearer title",
        status: "open",
        lost: false,
        data: { author: "Ada" },
      },
    });

    expect(annotations.add({
      id: "review-1",
      pointer: "/items/1/title",
      text: "Duplicate",
    })).toEqual({ ok: false, code: "duplicate_id", id: "review-1" });
    expect(annotations.add({
      pointer: "/items/1/title",
      text: "   ",
    })).toEqual({ ok: false, code: "empty_text" });
    expect(annotations.add({
      pointer: "/items/9/title",
      text: "Missing",
    })).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/items/9/title",
    });
  });

  test("tracks annotation anchors across structural edits", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);

    annotations.add({
      id: "b-title",
      pointer: "/items/1/title",
      text: "Review B",
    });

    expect(doc.insert("/items/0", { id: "x", title: "X", done: false })).toEqual({ ok: true });
    expect(annotations.byId("b-title")).toMatchObject({
      pointer: "/items/2/title",
      lost: false,
    });

    expect(doc.delete("/items/0")).toEqual({ ok: true });
    expect(annotations.byId("b-title")).toMatchObject({
      pointer: "/items/1/title",
      lost: false,
    });

    expect(doc.move("/items/1", "/items/-")).toEqual({ ok: true });
    expect(annotations.byId("b-title")).toMatchObject({
      pointer: "/items/2/title",
      lost: false,
    });
  });

  test("marks annotations as lost when the anchor is removed", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);
    const listener = vi.fn();

    annotations.subscribe(listener);
    annotations.add({
      id: "title",
      pointer: "/items/1/title",
      text: "Review B title",
    });
    annotations.add({
      id: "meta",
      pointer: "/meta/title",
      text: "Review document title",
    });

    expect(doc.delete("/items/1")).toEqual({ ok: true });

    expect(annotations.current()).toEqual({
      annotations: [
        {
          id: "meta",
          pointer: "/meta/title",
          text: "Review document title",
          status: "open",
          lost: false,
        },
        {
          id: "title",
          pointer: null,
          text: "Review B title",
          status: "open",
          lost: true,
        },
      ],
      open: 2,
      resolved: 0,
      lost: 1,
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("filters annotations by pointer, status, and lost state", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);

    annotations.add({
      id: "item",
      pointer: "/items/0",
      text: "Review item",
    });
    annotations.add({
      id: "title",
      pointer: "/items/0/title",
      text: "Review title",
    });
    annotations.add({
      id: "done",
      pointer: "/items/0/done",
      text: "Review checkbox",
      status: "resolved",
    });

    expect(annotations.forPointer("/items/0", { includeDescendants: true })).toEqual({
      ok: true,
      annotations: [
        {
          id: "item",
          pointer: "/items/0",
          text: "Review item",
          status: "open",
          lost: false,
        },
        {
          id: "title",
          pointer: "/items/0/title",
          text: "Review title",
          status: "open",
          lost: false,
        },
      ],
    });

    expect(annotations.forPointer("/items/0", {
      includeDescendants: true,
      includeResolved: true,
    })).toMatchObject({
      ok: true,
      annotations: [
        { id: "done" },
        { id: "item" },
        { id: "title" },
      ],
    });

    expect(annotations.resolve("title")).toMatchObject({
      ok: true,
      annotation: { id: "title", status: "resolved" },
    });
    expect(annotations.current({ status: "open" }).annotations.map((annotation) => annotation.id)).toEqual([
      "item",
    ]);
  });

  test("updates text, status, data, and anchor without mutating core state", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);

    annotations.add({
      id: "note",
      pointer: "/items/0/title",
      text: "Old",
      data: { author: "Ada" },
    });

    expect(annotations.update("note", {
      pointer: "/items/2/title",
      text: "New",
      status: "resolved",
      data: { author: "Grace", severity: "low" },
    })).toEqual({
      ok: true,
      annotation: {
        id: "note",
        pointer: "/items/2/title",
        text: "New",
        status: "resolved",
        lost: false,
        data: { author: "Grace", severity: "low" },
      },
    });

    expect(annotations.update("note", { data: null })).toEqual({
      ok: true,
      annotation: {
        id: "note",
        pointer: "/items/2/title",
        text: "New",
        status: "resolved",
        lost: false,
      },
    });
    expect(doc.at("/items/2/title")).toEqual({
      ok: true,
      path: "/items/2/title",
      value: "C",
    });
  });

  test("can be disposed independently from the document", () => {
    const doc = createDoc();
    const annotations = createAnnotations(doc);
    const listener = vi.fn();

    annotations.add({
      id: "note",
      pointer: "/items/1/title",
      text: "Review",
    });
    annotations.subscribe(listener);
    annotations.dispose();

    expect(doc.insert("/items/0", { id: "x", title: "X", done: false })).toEqual({ ok: true });
    expect(annotations.byId("note")).toMatchObject({
      pointer: "/items/1/title",
      lost: false,
    });
    expect(listener).not.toHaveBeenCalled();
    expect(annotations.subscribe(listener)).toEqual(expect.any(Function));
  });
});
