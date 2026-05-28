import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createSelectionModel, type SelectionModelSnapshot } from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
});
const Board = z.object({
  cards: z.array(Card),
  title: z.string(),
});

function createBoard() {
  return createJSONDocument(Board, {
    title: "Board",
    cards: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
  }, {
    selection: { mode: "multiple" },
  });
}

describe("@zod-crud/selection-model", () => {
  test("selects one pointer and exposes selected values", () => {
    const model = createSelectionModel(createBoard());

    expect(model.select("/cards/1")).toMatchObject({
      ok: true,
      pointers: ["/cards/1"],
      primaryPointer: "/cards/1",
      values: [
        { path: "/cards/1", value: { id: "b", title: "B" } },
      ],
    });
  });

  test("selects many pointers through the public selection facade", () => {
    const model = createSelectionModel(createBoard());

    expect(model.selectMany(["/cards/0", "/cards/1"])).toMatchObject({
      ok: true,
      pointers: ["/cards/0", "/cards/1"],
      primaryPointer: "/cards/1",
    });
  });

  test("toggles and clears selection", () => {
    const model = createSelectionModel(createBoard());

    expect(model.toggle("/cards/0")).toMatchObject({
      ok: true,
      pointers: ["/cards/0"],
    });
    expect(model.toggle("/cards/0")).toMatchObject({
      ok: true,
      pointers: [],
      primaryPointer: null,
    });
    expect(model.select("/title")).toMatchObject({ ok: true, pointers: ["/title"] });
    expect(model.clear()).toMatchObject({ ok: true, pointers: [] });
  });

  test("rejects missing pointers before mutating selection", () => {
    const model = createSelectionModel(createBoard());

    expect(model.select("/cards/99")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/cards/99",
    });
    expect(model.current()).toMatchObject({
      ok: true,
      pointers: [],
    });
  });

  test("reports when document selection is disabled", () => {
    const doc = createJSONDocument(Board, {
      title: "Board",
      cards: [],
    });
    const model = createSelectionModel(doc);

    expect(model.current()).toEqual({
      ok: false,
      code: "selection_unavailable",
      reason: "document selection is not enabled",
    });
    expect(model.select("/title")).toMatchObject({
      ok: false,
      code: "selection_unavailable",
    });
  });

  test("notifies selection changes until disposed", () => {
    const doc = createBoard();
    const model = createSelectionModel(doc);
    const events: SelectionModelSnapshot[] = [];

    model.subscribe((snapshot) => {
      events.push(snapshot);
    });

    doc.selection?.collapse("/cards/0");
    doc.selection?.collapse("/cards/1");
    model.dispose();
    doc.selection?.collapse("/title");

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ ok: true, pointers: ["/cards/0"] });
    expect(events[1]).toMatchObject({ ok: true, pointers: ["/cards/1"] });
  });
});
