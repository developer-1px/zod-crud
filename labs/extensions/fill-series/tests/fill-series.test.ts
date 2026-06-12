import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canFill, createFillSeries, type FillSeriesResult } from "../src/index.js";

const Row = z.object({
  label: z.string(),
  qty: z.number(),
});
const Schema = z.object({
  rows: z.array(Row),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [
      { label: "a", qty: 0 },
      { label: "b", qty: 0 },
      { label: "c", qty: 0 },
      { label: "d", qty: 0 },
    ],
  });
}

function expectOk<T>(result: FillSeriesResult<T>): Extract<FillSeriesResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok result, got ${result.code}: ${result.reason}`);
  return result;
}

const RANGE = ["/rows/1", "/rows/2", "/rows/3"];

describe("@interactive-os/json-document-fill-series", () => {
  test("constant fill writes one value into a field across the range", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    const result = expectOk(filler.fill(RANGE, { value: 7 }, { field: "/qty" }));
    expect(result.changed).toBe(true);
    expect(result.values).toEqual([7, 7, 7]);
    expect(result.pointers).toEqual(["/rows/1/qty", "/rows/2/qty", "/rows/3/qty"]);
    expect(result.selectionAfter).toEqual(["/rows/1", "/rows/2", "/rows/3"]);
    expect(doc.value.rows.map((row) => row.qty)).toEqual([0, 7, 7, 7]);
  });

  test("linear series fills start + offset * step", () => {
    const doc = createDoc();
    const result = expectOk(
      canFill(doc, RANGE, { series: { start: 10, step: 5 } }, { field: "/qty" }),
    );
    expect(result.values).toEqual([10, 15, 20]);
    // canFill never mutates.
    expect(doc.value.rows.map((row) => row.qty)).toEqual([0, 0, 0, 0]);
  });

  test("series infers start from the first cell when start is omitted", () => {
    const doc = createDoc();
    doc.replace("/rows/1/qty", 100);
    const filler = createFillSeries(doc);

    const result = expectOk(filler.fill(RANGE, { series: { step: 2 } }, { field: "/qty" }));
    expect(result.values).toEqual([100, 102, 104]);
    expect(doc.value.rows.map((row) => row.qty)).toEqual([0, 100, 102, 104]);
  });

  test("series with no numeric seed and no explicit start fails clearly", () => {
    const doc = createDoc();
    const result = canFill(doc, RANGE, { series: { step: 1 } }, { field: "/label" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("generator_failed");
  });

  test("host generator receives cell context", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    const result = expectOk(
      filler.fill(
        RANGE,
        { from: (cell) => `row-${cell.index}-#${cell.offset}` },
        { field: "/label" },
      ),
    );
    expect(result.values).toEqual(["row-1-#0", "row-2-#1", "row-3-#2"]);
    expect(doc.value.rows.map((row) => row.label)).toEqual(["a", "row-1-#0", "row-2-#1", "row-3-#2"]);
  });

  test("filling the whole item without a field replaces the items", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    const result = expectOk(
      filler.fill(["/rows/0", "/rows/1"], { value: { label: "x", qty: 9 } }),
    );
    expect(result.field).toBe("");
    expect(doc.value.rows.slice(0, 2)).toEqual([
      { label: "x", qty: 9 },
      { label: "x", qty: 9 },
    ]);
  });

  test("an unchanged fill reports changed:false with no operations", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    const result = expectOk(filler.fill(RANGE, { value: 0 }, { field: "/qty" }));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("a schema-violating series is rejected by canPatch, not applied", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    // Writing numbers into the string `label` field must be rejected.
    const result = filler.fill(RANGE, { series: { start: 1, step: 1 } }, { field: "/label" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.rows.map((row) => row.label)).toEqual(["a", "b", "c", "d"]);
  });

  test("non-contiguous targets are rejected", () => {
    const doc = createDoc();
    const result = canFill(doc, ["/rows/0", "/rows/2"], { value: 1 }, { field: "/qty" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_contiguous");
  });

  test("targets across different parents are rejected", () => {
    const doc = createDoc();
    const result = canFill(doc, ["/rows/0", "/other/0"], { value: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("mixed_parent");
  });

  test("targets that are not array items are rejected", () => {
    const doc = createDoc();
    const result = canFill(doc, ["/rows"], { value: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_pointer");
  });

  test("an empty target is rejected", () => {
    const doc = createDoc();
    const result = canFill(doc, [], { value: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_target");
  });

  test("out-of-range indices are rejected", () => {
    const doc = createDoc();
    const result = canFill(doc, ["/rows/3", "/rows/4"], { value: 1 }, { field: "/qty" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("index_out_of_range");
  });

  test("targets given out of order are normalized to a sorted range", () => {
    const doc = createDoc();
    const filler = createFillSeries(doc);

    const result = expectOk(
      filler.canFill(["/rows/3", "/rows/1", "/rows/2"], { series: { start: 1, step: 1 } }, { field: "/qty" }),
    );
    expect(result.pointers).toEqual(["/rows/1/qty", "/rows/2/qty", "/rows/3/qty"]);
    expect(result.values).toEqual([1, 2, 3]);
  });
});
