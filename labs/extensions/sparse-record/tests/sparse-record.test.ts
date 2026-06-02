import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canEditSparseRecords,
  createSparseRecord,
  type SparseRecordResult,
} from "../src/index.js";

const Schema = z.object({
  cells: z.record(z.string(), z.string()),
  styles: z.record(z.string(), z.object({
    bold: z.boolean(),
  })),
  validation: z.record(z.string(), z.object({
    kind: z.literal("checkbox"),
  })),
  rows: z.array(z.string()),
});

function createDoc() {
  return createJSONDocument(Schema, {
    cells: {
      A1: "old",
      B2: "same",
      C3: "clear",
    },
    styles: {
      B2: { bold: false },
    },
    validation: {},
    rows: [],
  });
}

function expectOk(result: SparseRecordResult): Extract<SparseRecordResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/sparse-record", () => {
  test("plans add, replace, remove, and no-op entries in one command", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    const result = expectOk(sparse.edit({
      root: "/cells",
      set: {
        A1: "new",
        B2: "same",
        D4: "added",
      },
      remove: ["C3", "E5"],
    }));

    expect(result).toMatchObject({
      changed: true,
      count: 5,
      added: 1,
      replaced: 1,
      removed: 1,
      unchanged: 2,
      operations: [
        { op: "replace", path: "/cells/A1", value: "new" },
        { op: "add", path: "/cells/D4", value: "added" },
        { op: "remove", path: "/cells/C3" },
      ],
    });
    expect(result.decisions).toMatchObject([
      { root: "/cells", key: "A1", pointer: "/cells/A1", intent: "set", action: "replace" },
      { root: "/cells", key: "B2", pointer: "/cells/B2", intent: "set", action: "noop" },
      { root: "/cells", key: "D4", pointer: "/cells/D4", intent: "set", action: "add" },
      { root: "/cells", key: "C3", pointer: "/cells/C3", intent: "remove", action: "remove" },
      { root: "/cells", key: "E5", pointer: "/cells/E5", intent: "remove", action: "noop" },
    ]);
    expect(doc.value.cells).toEqual({
      A1: "new",
      B2: "same",
      D4: "added",
    });
  });

  test("edits multiple sparse roots as one patch batch", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    const result = expectOk(sparse.edit([
      {
        root: "/cells",
        set: { A1: "TRUE" },
      },
      {
        root: "/validation",
        set: { A1: { kind: "checkbox" } },
      },
    ], undefined, { label: "convert checkbox" }));

    expect(result.operations).toEqual([
      { op: "replace", path: "/cells/A1", value: "TRUE" },
      { op: "add", path: "/validation/A1", value: { kind: "checkbox" } },
    ]);
    expect(doc.value.cells.A1).toBe("TRUE");
    expect(doc.value.validation.A1).toEqual({ kind: "checkbox" });
    expect(doc.lastPatch).toEqual(result.operations);
  });

  test("canEdit does not mutate", () => {
    const doc = createDoc();

    const result = expectOk(canEditSparseRecords(doc, {
      root: "/cells",
      set: { A1: "new", D4: "added" },
      remove: ["C3"],
    }));

    expect(result.changed).toBe(true);
    expect(doc.value.cells).toEqual({
      A1: "old",
      B2: "same",
      C3: "clear",
    });
  });

  test("uses host equality for product-normalized no-ops", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    const result = expectOk(sparse.edit({
      root: "/cells",
      set: { A1: "OLD" },
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

  test("rejects schema-invalid planned values before mutating", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    const result = sparse.edit({
      root: "/cells",
      set: { A1: 123 },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "patch_rejected",
    });
    expect(doc.value.cells.A1).toBe("old");
  });

  test("rejects missing and non-record roots", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    expect(sparse.edit({ root: "/missing", set: { A1: "x" } })).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
    expect(sparse.edit({ root: "/rows", set: { A1: "x" } })).toMatchObject({
      ok: false,
      code: "not_record",
      pointer: "/rows",
    });
  });

  test("rejects conflicting declarations for the same sparse entry", () => {
    const doc = createDoc();
    const sparse = createSparseRecord(doc);

    expect(sparse.edit({
      root: "/cells",
      set: { A1: "new" },
      remove: ["A1"],
    })).toMatchObject({
      ok: false,
      code: "conflicting_entry",
      pointer: "/cells/A1",
    });

    expect(sparse.edit([
      { root: "/cells", set: { A1: "new" } },
      { root: "/cells", set: { A1: "other" } },
    ])).toMatchObject({
      ok: false,
      code: "conflicting_entry",
      pointer: "/cells/A1",
    });
  });
});
