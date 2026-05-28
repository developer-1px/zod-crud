import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createListOps } from "../src/index.js";

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
  }, {
    history: 20,
  });
}

describe("@zod-crud/list-ops", () => {
  test("moves list items up and down through public document patching", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.canMoveUp("/backlog/1")).toEqual({ ok: true });
    expect(list.moveUp("/backlog/1")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "idea", "later"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/1", path: "/backlog/0" }]);

    expect(list.canMoveDown("/backlog/1")).toEqual({ ok: true });
    expect(list.moveDown("/backlog/1")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "later", "idea"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/1", path: "/backlog/2" }]);
  });

  test("reports movement boundaries without mutating", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.canMoveUp("/backlog/0")).toMatchObject({
      ok: false,
      code: "move_boundary",
      pointer: "/backlog/0",
    });
    expect(list.moveDown("/backlog/2")).toMatchObject({
      ok: false,
      code: "move_boundary",
      pointer: "/backlog/2",
    });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["idea", "todo", "later"]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("moves items before and after targets in the same array", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.moveBefore("/backlog/0", "/backlog/2")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "idea", "later"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/0", path: "/backlog/1" }]);

    expect(list.moveAfter("/backlog/2", "/backlog/0")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["todo", "later", "idea"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/backlog/2", path: "/backlog/1" }]);
  });

  test("moves cards across kanban lists", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.moveBefore("/columns/0/cards/1", "/columns/1/cards/1")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["a"]);
    expect(doc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["c", "b", "d"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/columns/0/cards/1", path: "/columns/1/cards/1" }]);

    expect(list.moveAfter("/columns/1/cards/0", "/columns/0/cards/0")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["a", "c"]);
    expect(doc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["b", "d"]);
    expect(doc.lastPatch).toEqual([{ op: "move", from: "/columns/1/cards/0", path: "/columns/0/cards/1" }]);
  });

  test("leaves already satisfied before and after moves as no-ops", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.moveBefore("/backlog/0", "/backlog/1")).toEqual({ ok: true });
    expect(list.moveAfter("/backlog/1", "/backlog/0")).toEqual({ ok: true });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["idea", "todo", "later"]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("duplicates an array item after itself with optional rekeying", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.duplicateAfter("/backlog/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      duplicatedTo: "/backlog/1",
      applied: [{ op: "add", path: "/backlog/1", value: { id: "idea-copy", title: "Idea" } }],
    });
    expect(doc.value.backlog.map((card) => card.id)).toEqual(["idea", "idea-copy", "todo", "later"]);
  });

  test("rejects non-array item pointers before calling document commands", () => {
    const doc = createBoard();
    const list = createListOps(doc);

    expect(list.moveUp("/columns/0/id")).toMatchObject({
      ok: false,
      code: "not_array_item",
      pointer: "/columns/0/id",
    });
    expect(list.duplicateAfter("/missing/0")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });
});
