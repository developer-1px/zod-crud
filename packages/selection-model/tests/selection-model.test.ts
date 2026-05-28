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
  rows: z.array(z.object({ id: z.string(), label: z.string() })),
  slides: z.array(z.object({ id: z.string(), title: z.string() })),
  layers: z.array(z.object({ id: z.string(), name: z.string() })),
  tabs: z.array(z.object({ id: z.string(), label: z.string() })),
  title: z.string(),
});

function createBoard() {
  return createJSONDocument(Board, {
    title: "Board",
    cards: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    rows: [
      { id: "row-a", label: "Row A" },
      { id: "row-b", label: "Row B" },
    ],
    slides: [
      { id: "intro", title: "Intro" },
      { id: "demo", title: "Demo" },
    ],
    layers: [
      { id: "bg", name: "Background" },
      { id: "title", name: "Title" },
    ],
    tabs: [
      { id: "sheet-1", label: "Sheet 1" },
      { id: "sheet-2", label: "Sheet 2" },
    ],
  }, {
    selection: { mode: "multiple" },
  });
}

describe("@zod-crud/selection-model", () => {
  test("selects one pointer and exposes selected values", () => {
    const model = createSelectionModel(createBoard());

    expect(model.canSelect("/cards/1")).toEqual({ ok: true });
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

    expect(model.canSelectMany(["/cards/0", "/cards/1"])).toEqual({ ok: true });
    expect(model.selectMany(["/cards/0", "/cards/1"])).toMatchObject({
      ok: true,
      pointers: ["/cards/0", "/cards/1"],
      primaryPointer: "/cards/1",
    });
  });

  test("models common editor selection shapes without product-specific API", () => {
    const model = createSelectionModel(createBoard());

    expect(model.selectMany([
      "/rows/1",
      "/slides/0",
      "/layers/1",
      "/tabs/0",
    ])).toMatchObject({
      ok: true,
      pointers: ["/rows/1", "/slides/0", "/layers/1", "/tabs/0"],
      primaryPointer: "/tabs/0",
      values: [
        { path: "/rows/1", value: { id: "row-b", label: "Row B" } },
        { path: "/slides/0", value: { id: "intro", title: "Intro" } },
        { path: "/layers/1", value: { id: "title", name: "Title" } },
        { path: "/tabs/0", value: { id: "sheet-1", label: "Sheet 1" } },
      ],
    });
  });

  test("exposes methods that remain safe when extracted", () => {
    const model = createSelectionModel(createBoard());
    const { canSelect, selectMany, toggle, clear } = model;

    expect(canSelect("/cards/0")).toEqual({ ok: true });
    expect(selectMany(["/cards/0", "/cards/1"])).toMatchObject({
      ok: true,
      pointers: ["/cards/0", "/cards/1"],
    });
    expect(toggle("/cards/0")).toMatchObject({
      ok: true,
      pointers: ["/cards/1"],
    });
    expect(clear()).toMatchObject({ ok: true, pointers: [] });
  });

  test("toggles and clears selection", () => {
    const model = createSelectionModel(createBoard());

    expect(model.canToggle("/cards/0")).toEqual({ ok: true });
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
    expect(model.canClear()).toEqual({ ok: true });
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
      rows: [],
      slides: [],
      layers: [],
      tabs: [],
    });
    const model = createSelectionModel(doc);

    expect(model.current()).toEqual({
      ok: false,
      code: "selection_unavailable",
      reason: "document selection is not enabled",
    });
    expect(model.canClear()).toMatchObject({
      ok: false,
      code: "selection_unavailable",
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
