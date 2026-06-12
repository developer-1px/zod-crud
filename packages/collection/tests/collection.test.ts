import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { createCollection } from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
});
const Column = z.object({
  id: z.string(),
  cards: z.array(Card),
});
const Board = z.object({
  backlog: z.array(Card),
  columns: z.array(Column),
  outline: z.array(z.object({ id: z.string(), text: z.string() })),
  slides: z.array(z.object({ id: z.string(), name: z.string() })),
  sections: z.array(z.object({ id: z.string(), kind: z.string() })),
  layers: z.array(z.object({ id: z.string(), name: z.string() })),
  tabs: z.array(z.object({ id: z.string(), label: z.string() })),
});
const UniqueSlideBoard = Board.superRefine((board, ctx) => {
  const seen = new Set<string>();
  for (const [index, slide] of board.slides.entries()) {
    if (seen.has(slide.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["slides", index, "id"],
        message: "duplicate slide id",
      });
    }
    seen.add(slide.id);
  }
});

function createBoard() {
  return createJSONDocument(Board, {
    backlog: [
      { id: "idea", title: "Idea" },
      { id: "todo", title: "Todo" },
      { id: "later", title: "Later" },
    ],
    columns: [
      {
        id: "doing",
        cards: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
      },
      {
        id: "done",
        cards: [
          { id: "c", title: "C" },
          { id: "d", title: "D" },
        ],
      },
    ],
    outline: [
      { id: "heading", text: "Heading" },
      { id: "child", text: "Child" },
    ],
    slides: [
      { id: "intro", name: "Intro" },
      { id: "demo", name: "Demo" },
    ],
    sections: [
      { id: "hero", kind: "hero" },
      { id: "gallery", kind: "gallery" },
    ],
    layers: [
      { id: "background", name: "Background" },
      { id: "title", name: "Title" },
    ],
    tabs: [
      { id: "sheet-1", label: "Sheet 1" },
      { id: "sheet-2", label: "Sheet 2" },
      { id: "sheet-3", label: "Sheet 3" },
      { id: "sheet-4", label: "Sheet 4" },
    ],
  }, {
    history: 20,
  });
}

describe("@interactive-os/json-document-collection", () => {
  test("moves collection items up and down through public document verbs", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canMoveUp("/backlog/1")).toEqual({ ok: true });
    expect(collection.moveUp("/backlog/1")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "idea", "later"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/1", path: "/backlog/0" }]);

    expect(collection.canMoveDown("/backlog/1")).toEqual({ ok: true });
    expect(collection.moveDown("/backlog/1")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "later", "idea"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/1", path: "/backlog/2" }]);
  });

  test("reports movement boundaries without mutating", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canMoveUp("/backlog/0")).toMatchObject({
      ok: false,
      code: "move_boundary",
      pointer: "/backlog/0",
    });
    expect(collection.moveDown("/backlog/2")).toMatchObject({
      ok: false,
      code: "move_boundary",
      pointer: "/backlog/2",
    });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["idea", "todo", "later"]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("moves items before and after targets in the same collection", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canMoveBefore("/backlog/0", "/backlog/2")).toEqual({ ok: true });
    expect(collection.moveBefore("/backlog/0", "/backlog/2")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "idea", "later"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/0", path: "/backlog/1" }]);

    expect(collection.canMoveAfter("/backlog/2", "/backlog/0")).toEqual({ ok: true });
    expect(collection.moveAfter("/backlog/2", "/backlog/0")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "later", "idea"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/2", path: "/backlog/1" }]);
  });

  test("moves items across collections", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.moveBefore("/columns/0/cards/1", "/columns/1/cards/1")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["a"]);
    expect(doc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["c", "b", "d"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/columns/0/cards/1", path: "/columns/1/cards/1" }]);

    expect(collection.moveAfter("/columns/1/cards/0", "/columns/0/cards/0")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["a", "c"]);
    expect(doc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["b", "d"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/columns/1/cards/0", path: "/columns/0/cards/1" }]);
  });

  test("uses the same API across common editor collection shapes", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.moveAfter("/outline/0", "/outline/1")).toEqual({ ok: true });
    expect(doc.value.outline.map((item) => item.id)).toEqual(["child", "heading"]);

    expect(collection.duplicateAfter("/sections/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({ ok: true, duplicatedTo: "/sections/1" });
    expect(doc.value.sections.map((section) => section.id)).toEqual(["hero", "hero-copy", "gallery"]);

    expect(collection.moveUp("/layers/1")).toEqual({ ok: true });
    expect(doc.value.layers.map((layer) => layer.id)).toEqual(["title", "background"]);

    expect(collection.deleteItems("/tabs/0")).toEqual({ ok: true });
    expect(doc.value.tabs.map((tab) => tab.id)).toEqual(["sheet-2", "sheet-3", "sheet-4"]);
  });

  test("leaves already satisfied before and after moves as no-ops", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canMoveBefore("/backlog/0", "/backlog/1")).toEqual({ ok: true });
    expect(collection.moveBefore("/backlog/0", "/backlog/1")).toEqual({ ok: true });
    expect(collection.canMoveAfter("/backlog/1", "/backlog/0")).toEqual({ ok: true });
    expect(collection.moveAfter("/backlog/1", "/backlog/0")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["idea", "todo", "later"]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("duplicates a collection item after itself with optional rekeying", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canDuplicateAfter("/slides/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toEqual({ ok: true });
    expect(collection.duplicateAfter("/slides/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      duplicatedTo: "/slides/1",
      applied: [{ op: "add", path: "/slides/1", value: { id: "intro-copy", name: "Intro" } }],
    });
    expect(doc.value.slides.map((slide) => slide.id)).toEqual(["intro", "intro-copy", "demo"]);
  });

  test("deletes multiple collection items as one document change", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canDeleteItems(["/tabs/1", "/tabs/3"])).toEqual({ ok: true });
    expect(collection.deleteItems(["/tabs/1", "/tabs/3"])).toEqual({ ok: true });
    expect(doc.value.tabs.map((tab) => tab.id)).toEqual(["sheet-1", "sheet-3"]);
    expect(doc.lastPatch).toEqual([
      { op: "remove", path: "/tabs/3" },
      { op: "remove", path: "/tabs/1" },
    ]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("deduplicates delete inputs before delegating to the document", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.deleteItems(["/tabs/1", "/tabs/1", "/tabs/2"])).toEqual({ ok: true });
    expect(doc.value.tabs.map((tab) => tab.id)).toEqual(["sheet-1", "sheet-4"]);
    expect(doc.lastPatch).toEqual([
      { op: "remove", path: "/tabs/2" },
      { op: "remove", path: "/tabs/1" },
    ]);
  });

  test("rejects empty and non-collection item sources without mutating", () => {
    const doc = createBoard();
    const collection = createCollection(doc);

    expect(collection.canDeleteItems([])).toMatchObject({
      ok: false,
      code: "empty_selection",
    });
    expect(collection.moveUp("/columns/0/id")).toMatchObject({
      ok: false,
      code: "not_collection_item",
      pointer: "/columns/0/id",
    });
    expect(collection.duplicateAfter("/missing/0")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
    expect(doc.history.undoDepth).toBe(0);
  });

  test("propagates document capability failures", () => {
    const doc = createJSONDocument(UniqueSlideBoard, createBoard().value, {
      history: 20,
    });
    const collection = createCollection(doc);

    expect(collection.canDuplicateAfter("/slides/0")).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(collection.duplicateAfter("/slides/0")).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
  });
});
