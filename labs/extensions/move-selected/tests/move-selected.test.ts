import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canMoveSelected, createMoveSelected, type MoveSelectedResult } from "../src/index.js";

const Schema = z.object({
  rows: z.array(z.object({ id: z.string() })),
  other: z.array(z.object({ id: z.string() })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
    other: [{ id: "x" }],
  });
}

function ids(doc: ReturnType<typeof createDoc>): string[] {
  return doc.value.rows.map((row) => row.id);
}

function expectOk(result: MoveSelectedResult): Extract<MoveSelectedResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/move-selected", () => {
  test("moves a block after a later sibling, preserving internal order", () => {
    const doc = createDoc();
    const mover = createMoveSelected(doc);

    const result = expectOk(mover.moveSelected(["/rows/1", "/rows/2"], { after: "/rows/3" }));
    expect(ids(doc)).toEqual(["a", "d", "b", "c", "e"]);
    expect(result.selectionAfter).toEqual(["/rows/2", "/rows/3"]);
  });

  test("moves a single item up (before an earlier sibling)", () => {
    const doc = createDoc();
    const mover = createMoveSelected(doc);

    expectOk(mover.moveSelected(["/rows/3"], { before: "/rows/1" }));
    expect(ids(doc)).toEqual(["a", "d", "b", "c", "e"]);
  });

  test("moves a leading block to the end (after the last sibling)", () => {
    const doc = createDoc();
    const mover = createMoveSelected(doc);

    const result = expectOk(mover.moveSelected(["/rows/0", "/rows/1"], { after: "/rows/4" }));
    expect(ids(doc)).toEqual(["c", "d", "e", "a", "b"]);
    expect(result.selectionAfter).toEqual(["/rows/3", "/rows/4"]);
  });

  test("moving a block to its current position is a no-op", () => {
    const doc = createDoc();
    const mover = createMoveSelected(doc);

    const result = expectOk(mover.moveSelected(["/rows/1", "/rows/2"], { after: "/rows/0" }));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
    expect(ids(doc)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("canMoveSelected does not mutate the document", () => {
    const doc = createDoc();
    const result = expectOk(canMoveSelected(doc, ["/rows/0"], { after: "/rows/3" }));
    expect(result.changed).toBe(true);
    expect(ids(doc)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("a target inside the moved selection is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, ["/rows/1", "/rows/2"], { before: "/rows/2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("target_in_selection");
  });

  test("a non-contiguous source is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, ["/rows/0", "/rows/2"], { after: "/rows/3" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_contiguous");
  });

  test("a source spanning two parents is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, ["/rows/0", "/other/0"], { after: "/rows/3" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("mixed_parent");
  });

  test("a target in a different parent is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, ["/rows/0", "/rows/1"], { after: "/other/0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("target_parent_mismatch");
  });

  test("a source that is not an array item is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, ["/rows"], { after: "/rows/3" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array_item");
  });

  test("an empty source is rejected", () => {
    const doc = createDoc();
    const result = canMoveSelected(doc, [], { after: "/rows/3" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_selection");
  });

  test("source given out of order is normalized to a contiguous block", () => {
    const doc = createDoc();
    const mover = createMoveSelected(doc);

    expectOk(mover.moveSelected(["/rows/2", "/rows/1"], { after: "/rows/3" }));
    expect(ids(doc)).toEqual(["a", "d", "b", "c", "e"]);
  });
});
