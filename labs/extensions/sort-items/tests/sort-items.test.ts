import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  canReverse,
  canSort,
  type SortItemsCompare,
  createSortItems,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  rank: z.number(),
});
const Schema = z.object({
  title: z.string(),
  cards: z.array(Card),
});
type CardValue = z.output<typeof Card>;
const byRank: SortItemsCompare<CardValue> = (left, right) => left.value.rank - right.value.rank;
const byTitle: SortItemsCompare<CardValue> = (left, right) =>
  left.value.title.localeCompare(right.value.title);

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Board",
    cards: [
      { id: "b", title: "Beta", rank: 2 },
      { id: "a", title: "Alpha", rank: 1 },
      { id: "c", title: "Gamma", rank: 3 },
    ],
  });
}

describe("@interactive-os/json-document-sort-items", () => {
  test("plans collection sorting without mutating the document", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    const change = sorter.canSort("/cards", byRank);

    expect(change).toMatchObject({
      ok: true,
      path: "/cards",
      count: 3,
      changed: true,
      values: [
        { id: "a", title: "Alpha", rank: 1 },
        { id: "b", title: "Beta", rank: 2 },
        { id: "c", title: "Gamma", rank: 3 },
      ],
      operations: [
        {
          op: "replace",
          path: "/cards",
          value: [
            { id: "a", title: "Alpha", rank: 1 },
            { id: "b", title: "Beta", rank: 2 },
            { id: "c", title: "Gamma", rank: 3 },
          ],
        },
      ],
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);
  });

  test("sorts a collection through the public document facade", () => {
    const doc = createDoc();

    const result = canSort(doc, "/cards", byTitle);
    expect(result).toMatchObject({ ok: true, changed: true });

    const sorter = createSortItems(doc);
    expect(sorter.sort("/cards", byTitle)).toMatchObject({ ok: true, changed: true });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
  });

  test("keeps stable order when comparator returns equal", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    expect(sorter.sort("/cards", () => 0)).toMatchObject({
      ok: true,
      changed: false,
      operations: [],
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);
    expect(doc.lastPatch).toEqual([]);
  });

  test("reverses a collection", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    expect(canReverse(doc, "/cards")).toMatchObject({ ok: true, changed: true });
    expect(sorter.reverse("/cards")).toMatchObject({
      ok: true,
      values: [
        { id: "c", title: "Gamma", rank: 3 },
        { id: "a", title: "Alpha", rank: 1 },
        { id: "b", title: "Beta", rank: 2 },
      ],
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["c", "a", "b"]);
  });

  test("reports non-collection and missing paths", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    expect(sorter.canSort("/title", () => 0)).toMatchObject({
      ok: false,
      code: "not_collection",
      pointer: "/title",
    });
    expect(sorter.canReverse("/missing")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });

  test("reports comparator failures without mutating", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    expect(sorter.sort("/cards", () => {
      throw new Error("rank missing");
    })).toMatchObject({
      ok: false,
      code: "compare_failed",
      reason: "rank missing",
      pointer: "/cards",
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);
  });

  test("preflights comparator-created invalid values", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    const result = sorter.canSort("/cards", (left, right) => {
      if (left.index === 0) {
        (left.value as { rank: unknown }).rank = "invalid";
      }
      if (right.index === 0) {
        (right.value as { rank: unknown }).rank = "invalid";
      }
      return left.index - right.index;
    });

    expect(result).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.cards[0]?.rank).toBe(2);
  });

  test("returns isolated planned values and operations", () => {
    const doc = createDoc();
    const sorter = createSortItems(doc);

    const change = sorter.canSort("/cards", byRank);
    if (!change.ok) throw new Error(change.reason);

    (change.values[0] as { title: string }).title = "Changed";
    const operation = change.operations[0];
    if (operation?.op !== "replace") throw new Error("expected replace operation");
    (operation.value as Array<{ title: string }>)[0]!.title = "Changed";

    expect(sorter.canSort("/cards", byRank)).toMatchObject({
      ok: true,
      values: [
        { id: "a", title: "Alpha", rank: 1 },
        { id: "b", title: "Beta", rank: 2 },
        { id: "c", title: "Gamma", rank: 3 },
      ],
    });
    expect(doc.value.cards[1]?.title).toBe("Alpha");
  });
});
