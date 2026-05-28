import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createRecordIndex, type RecordIndexSnapshot } from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Board = z.object({
  cards: z.array(Card),
});

function createBoard() {
  return createJSONDocument(Board, {
    cards: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: true },
    ],
  }, {
    history: 10,
  });
}

describe("@zod-crud/record-index", () => {
  test("indexes JSONPath records by a stable key field", () => {
    const index = createRecordIndex(createBoard(), {
      query: "$.cards[*]",
      key: "id",
    });

    expect(index.current()).toMatchObject({
      ok: true,
      keys: ["a", "b"],
      entries: [
        { key: "a", path: "/cards/0", value: { id: "a", title: "A", done: false } },
        { key: "b", path: "/cards/1", value: { id: "b", title: "B", done: true } },
      ],
    });
    expect(index.pointerFor("b")).toEqual({ ok: true, key: "b", path: "/cards/1" });
  });

  test("refreshes keyed pointers after array movement", () => {
    const doc = createBoard();
    const index = createRecordIndex(doc, {
      query: "$.cards[*]",
      key: "id",
    });

    expect(doc.patch({ op: "move", from: "/cards/0", path: "/cards/1" })).toEqual({ ok: true });

    expect(index.pointerFor("a")).toEqual({ ok: true, key: "a", path: "/cards/1" });
    expect(index.pointerFor("b")).toEqual({ ok: true, key: "b", path: "/cards/0" });
  });

  test("replaces records by key through public canReplace and patch", () => {
    const doc = createBoard();
    const index = createRecordIndex(doc, {
      query: "$.cards[*]",
      key: "id",
    });

    expect(index.canReplace("a", { id: "a", title: "A+", done: true })).toEqual({ ok: true });
    expect(index.replace("a", { id: "a", title: "A+", done: true })).toEqual({ ok: true });
    expect(doc.value.cards[0]).toEqual({ id: "a", title: "A+", done: true });
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/cards/0", value: { id: "a", title: "A+", done: true } },
    ]);
  });

  test("notifies subscribers only when the index snapshot changes", () => {
    const doc = createBoard();
    const index = createRecordIndex(doc, {
      query: "$.cards[*]",
      key: "id",
    });
    const events: RecordIndexSnapshot[] = [];

    index.subscribe((snapshot) => {
      events.push(snapshot);
    });

    expect(doc.patch({ op: "replace", path: "/cards/0/title", value: "A+" })).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      ok: true,
      entries: [
        { key: "a", value: { id: "a", title: "A+", done: false } },
        { key: "b", value: { id: "b", title: "B", done: true } },
      ],
    });
  });

  test("reports duplicate keys unless a duplicate policy is selected", () => {
    const doc = createJSONDocument(Board, {
      cards: [
        { id: "a", title: "A", done: false },
        { id: "a", title: "A2", done: true },
      ],
    });

    expect(createRecordIndex(doc, { query: "$.cards[*]", key: "id" }).current()).toMatchObject({
      ok: false,
      code: "duplicate_key",
      key: "a",
    });
    expect(createRecordIndex(doc, { query: "$.cards[*]", key: "id", duplicate: "last" }).get("a")).toMatchObject({
      ok: true,
      path: "/cards/1",
      value: { id: "a", title: "A2", done: true },
    });
  });

  test("reports invalid queries and missing keys", () => {
    expect(createRecordIndex(createBoard(), { query: "$.cards[", key: "id" }).current()).toMatchObject({
      ok: false,
      code: "syntax_error",
    });
    expect(createRecordIndex(createBoard(), { query: "$.cards[*]", key: "missing" }).current()).toMatchObject({
      ok: false,
      code: "missing_key",
      pointer: "/cards/0",
    });
  });

  test("dispose stops document-driven refreshes", () => {
    const doc = createBoard();
    const index = createRecordIndex(doc, {
      query: "$.cards[*]",
      key: "id",
    });

    index.dispose();
    expect(doc.patch({ op: "add", path: "/cards/-", value: { id: "c", title: "C", done: false } })).toEqual({ ok: true });

    expect(index.current()).toMatchObject({
      ok: true,
      keys: ["a", "b"],
    });
    expect(index.refresh()).toMatchObject({
      ok: true,
      keys: ["a", "b"],
    });
  });
});
