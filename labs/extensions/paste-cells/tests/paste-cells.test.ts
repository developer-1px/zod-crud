import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canPasteGrid, createPasteCells, type PasteCellsResult } from "../src/index.js";

const Schema = z.object({
  rows: z.array(z.object({ name: z.string(), qty: z.number() })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [
      { name: "a", qty: 0 },
      { name: "b", qty: 0 },
      { name: "c", qty: 0 },
    ],
  });
}

const FIELDS = ["/name", "/qty"];

function expectOk(result: PasteCellsResult): Extract<PasteCellsResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/paste-cells", () => {
  test("pastes a 2D matrix onto a rectangular region", () => {
    const doc = createDoc();
    const grid = createPasteCells(doc);

    const result = expectOk(
      grid.pasteGrid({ at: "/rows/1", fields: FIELDS }, [
        ["x", 10],
        ["y", 20],
      ]),
    );
    expect(result.rows).toBe(2);
    expect(result.cols).toBe(2);
    expect(result.selectionAfter).toEqual(["/rows/1", "/rows/2"]);
    expect(doc.value.rows).toEqual([
      { name: "a", qty: 0 },
      { name: "x", qty: 10 },
      { name: "y", qty: 20 },
    ]);
  });

  test("a ragged row only writes the provided columns", () => {
    const doc = createDoc();
    const grid = createPasteCells(doc);

    expectOk(grid.pasteGrid({ at: "/rows/0", fields: FIELDS }, [["only-name"]]));
    expect(doc.value.rows[0]).toEqual({ name: "only-name", qty: 0 });
  });

  test("extra columns beyond fields are ignored", () => {
    const doc = createDoc();
    const grid = createPasteCells(doc);

    expectOk(grid.pasteGrid({ at: "/rows/0", fields: ["/name"] }, [["kept", "dropped", "dropped2"]]));
    expect(doc.value.rows[0]).toEqual({ name: "kept", qty: 0 });
  });

  test("a region past the array end is rejected", () => {
    const doc = createDoc();
    const result = canPasteGrid(doc, { at: "/rows/2", fields: FIELDS }, [
      ["x", 1],
      ["y", 2],
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("region_out_of_range");
  });

  test("a schema-violating cell is rejected by canPatch, not applied", () => {
    const doc = createDoc();
    const grid = createPasteCells(doc);

    // qty column receives a string.
    const result = grid.pasteGrid({ at: "/rows/0", fields: FIELDS }, [["a", "not-a-number"]]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.rows[0]).toEqual({ name: "a", qty: 0 });
  });

  test("canPasteGrid does not mutate the document", () => {
    const doc = createDoc();
    const result = expectOk(canPasteGrid(doc, { at: "/rows/0", fields: FIELDS }, [["z", 9]]));
    expect(result.changed).toBe(true);
    expect(doc.value.rows[0]).toEqual({ name: "a", qty: 0 });
  });

  test("pasting identical values is a no-op", () => {
    const doc = createDoc();
    const grid = createPasteCells(doc);

    const result = expectOk(grid.pasteGrid({ at: "/rows/0", fields: FIELDS }, [["a", 0]]));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("an empty matrix is rejected", () => {
    const doc = createDoc();
    const result = canPasteGrid(doc, { at: "/rows/0", fields: FIELDS }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_matrix");
  });

  test("a target with no fields is rejected", () => {
    const doc = createDoc();
    const result = canPasteGrid(doc, { at: "/rows/0", fields: [] }, [["a"]]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_fields");
  });

  test("a target that is not an array item is rejected", () => {
    const doc = createDoc();
    const result = canPasteGrid(doc, { at: "/rows", fields: FIELDS }, [["a", 1]]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array_item");
  });
});
