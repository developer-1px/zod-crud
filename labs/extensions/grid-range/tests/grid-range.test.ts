import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canPasteGridRange,
  createGridRange,
  type GridRangeResult,
} from "../src/index.js";

const Schema = z.object({
  cells: z.record(z.string(), z.string()),
  styles: z.record(z.string(), z.object({
    bold: z.boolean(),
  })),
  rows: z.array(z.string()),
});

function createDoc() {
  return createJSONDocument(Schema, {
    cells: {
      A1: "old",
      B1: "same",
      C1: "clear",
      A2: "copy",
    },
    styles: {
      A1: { bold: true },
    },
    rows: [],
  });
}

function keyForCell({ row, column }: { row: number; column: number }) {
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

function expectOk(result: GridRangeResult): Extract<GridRangeResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/grid-range", () => {
  test("pastes a matrix into a sparse record range with add replace remove and no-op planning", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = expectOk(grid.paste({
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 2, columnCount: 3 },
      matrix: [
        ["new", "same", ""],
        ["copy", "added", "also-added"],
      ],
      keyForCell,
    }, {
      valueToIntent(value) {
        return value === "" ? { intent: "remove" } : { intent: "set", value };
      },
    }, { label: "paste grid" }));

    expect(result).toMatchObject({
      changed: true,
      count: 6,
      added: 2,
      replaced: 1,
      removed: 1,
      unchanged: 2,
      operations: [
        { op: "replace", path: "/cells/A1", value: "new" },
        { op: "remove", path: "/cells/C1" },
        { op: "add", path: "/cells/B2", value: "added" },
        { op: "add", path: "/cells/C2", value: "also-added" },
      ],
    });
    expect(result.decisions).toMatchObject([
      { key: "A1", pointer: "/cells/A1", intent: "set", action: "replace" },
      { key: "B1", pointer: "/cells/B1", intent: "set", action: "noop" },
      { key: "C1", pointer: "/cells/C1", intent: "remove", action: "remove" },
      { key: "A2", pointer: "/cells/A2", intent: "set", action: "noop" },
      { key: "B2", pointer: "/cells/B2", intent: "set", action: "add" },
      { key: "C2", pointer: "/cells/C2", intent: "set", action: "add" },
    ]);
    expect(result.selectionAfter.map((cell) => cell.key)).toEqual(["A1", "B1", "C1", "A2", "B2", "C2"]);
    expect(doc.lastPatch).toEqual(result.operations);
    expect(doc.value.cells).toEqual({
      A1: "new",
      B1: "same",
      A2: "copy",
      B2: "added",
      C2: "also-added",
    });
  });

  test("canPaste does not mutate", () => {
    const doc = createDoc();

    const result = expectOk(canPasteGridRange(doc, {
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 1, columnCount: 1 },
      matrix: [["new"]],
      keyForCell,
    }));

    expect(result.operations).toEqual([{ op: "replace", path: "/cells/A1", value: "new" }]);
    expect(doc.value.cells.A1).toBe("old");
  });

  test("fills a target range from a source range by repeating sparse source cells", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = expectOk(grid.fill({
      root: "/cells",
      source: { row: 0, column: 0, rowCount: 1, columnCount: 2 },
      target: { row: 2, column: 0, rowCount: 2, columnCount: 2 },
      keyForCell,
    }));

    expect(result.operations).toEqual([
      { op: "add", path: "/cells/A3", value: "old" },
      { op: "add", path: "/cells/B3", value: "same" },
      { op: "add", path: "/cells/A4", value: "old" },
      { op: "add", path: "/cells/B4", value: "same" },
    ]);
    expect(doc.value.cells.A3).toBe("old");
    expect(doc.value.cells.B4).toBe("same");
  });

  test("copies absent source cells as remove intents during fill", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = expectOk(grid.fill({
      root: "/cells",
      source: { row: 2, column: 0, rowCount: 1, columnCount: 1 },
      target: { row: 0, column: 0, rowCount: 1, columnCount: 2 },
      keyForCell,
    }));

    expect(result).toMatchObject({
      removed: 2,
      operations: [
        { op: "remove", path: "/cells/A1" },
        { op: "remove", path: "/cells/B1" },
      ],
    });
    expect(doc.value.cells.A1).toBeUndefined();
    expect(doc.value.cells.B1).toBeUndefined();
  });

  test("uses host equality for product-normalized no-ops", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = expectOk(grid.paste({
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 1, columnCount: 1 },
      matrix: [["OLD"]],
      keyForCell,
    }, {
      equals(current, next) {
        return String(current).toLocaleLowerCase() === String(next).toLocaleLowerCase();
      },
    }));

    expect(result.changed).toBe(false);
    expect(result.unchanged).toBe(1);
    expect(result.operations).toEqual([]);
    expect(doc.value.cells.A1).toBe("old");
  });

  test("rejects malformed ranges and matrices", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    expect(grid.paste({
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 1, columnCount: 2 },
      matrix: [["A1"]],
      keyForCell,
    })).toMatchObject({
      ok: false,
      code: "invalid_matrix",
    });

    expect(grid.paste({
      root: "/cells",
      range: { row: 2, column: 0, rowCount: 2, columnCount: 1 },
      matrix: [["A3"], ["A4"]],
      keyForCell,
      bounds: { rowCount: 3 },
    })).toMatchObject({
      ok: false,
      code: "out_of_bounds",
    });
  });

  test("rejects missing and non-record roots", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);
    const input = {
      range: { row: 0, column: 0, rowCount: 1, columnCount: 1 },
      matrix: [["x"]],
      keyForCell,
    };

    expect(grid.paste({ ...input, root: "/missing" })).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
    expect(grid.paste({ ...input, root: "/rows" })).toMatchObject({
      ok: false,
      code: "not_record",
      pointer: "/rows",
    });
  });

  test("rejects key collisions before mutating", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = grid.paste({
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 1, columnCount: 2 },
      matrix: [["one", "two"]],
      keyForCell: () => "A1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "conflicting_cell",
      pointer: "/cells/A1",
    });
    expect(doc.value.cells.A1).toBe("old");
  });

  test("rejects schema-invalid planned values before mutating", () => {
    const doc = createDoc();
    const grid = createGridRange(doc);

    const result = grid.paste({
      root: "/cells",
      range: { row: 0, column: 0, rowCount: 1, columnCount: 1 },
      matrix: [[123]],
      keyForCell,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "patch_rejected",
    });
    expect(doc.value.cells.A1).toBe("old");
  });
});
