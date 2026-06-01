import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canReindex, createReindex, type ReindexResult } from "../src/index.js";

const Schema = z.object({
  cards: z.array(z.object({ id: z.string(), order: z.number() })),
  pos: z.array(z.object({ id: z.string(), position: z.number() })),
  plain: z.array(z.string()),
});

function createDoc() {
  return createJSONDocument(Schema, {
    cards: [
      { id: "a", order: 5 },
      { id: "b", order: 2 },
      { id: "c", order: 9 },
    ],
    pos: [{ id: "x", position: 0 }],
    plain: ["a"],
  });
}

function expectOk(result: ReindexResult): Extract<ReindexResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/reindex", () => {
  test("syncs the order field to array position", () => {
    const doc = createDoc();
    const r = createReindex(doc);

    const result = expectOk(r.reindex("/cards"));
    expect(result.changedCount).toBe(3);
    expect(doc.value.cards.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  test("supports a custom field, start, and step", () => {
    const doc = createDoc();
    const r = createReindex(doc);

    expectOk(r.reindex("/pos", { field: "/position", start: 10, step: 10 }));
    expect(doc.value.pos.map((p) => p.position)).toEqual([10]);
  });

  test("already-sequential order is a no-op", () => {
    const doc = createJSONDocument(Schema, {
      cards: [
        { id: "a", order: 0 },
        { id: "b", order: 1 },
      ],
      pos: [],
      plain: [],
    });
    const r = createReindex(doc);

    const result = expectOk(r.reindex("/cards"));
    expect(result.changed).toBe(false);
    expect(result.changedCount).toBe(0);
  });

  test("only changed items produce operations", () => {
    const doc = createJSONDocument(Schema, {
      cards: [
        { id: "a", order: 0 },
        { id: "b", order: 99 },
        { id: "c", order: 2 },
      ],
      pos: [],
      plain: [],
    });
    const r = createReindex(doc);

    const result = expectOk(r.reindex("/cards"));
    expect(result.changedCount).toBe(1); // only index 1 (99 -> 1)
  });

  test("a non-number order field is rejected by canPatch", () => {
    const doc = createDoc();
    const r = createReindex(doc);

    // write the order into /id (a string field) -> numbers rejected
    const result = r.reindex("/cards", { field: "/id" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
  });

  test("canReindex does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canReindex(doc, "/cards"));
    expect(result.changedCount).toBe(3);
    expect(doc.value.cards.map((c) => c.order)).toEqual([5, 2, 9]);
  });

  test("rejects a non-array path", () => {
    const doc = createDoc();
    const result = canReindex(doc, "/cards/0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canReindex(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
