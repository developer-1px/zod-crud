import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canFillEmpty, createFillEmpty, type FillEmptyResult } from "../src/index.js";

const Schema = z.object({
  rows: z.array(z.object({ id: z.string(), note: z.string() })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [
      { id: "a", note: "" },
      { id: "b", note: "kept" },
      { id: "c", note: "" },
    ],
  });
}

function expectOk(result: FillEmptyResult): Extract<FillEmptyResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

const TARGETS = ["/rows/0", "/rows/1", "/rows/2"];

describe("@zod-crud/fill-empty", () => {
  test("fills only the empty slots, preserving non-empty ones", () => {
    const doc = createDoc();
    const f = createFillEmpty(doc);

    const result = expectOk(f.fillEmpty(TARGETS, { value: "n/a" }, { field: "/note" }));
    expect(result.filled).toBe(2);
    expect(doc.value.rows.map((r) => r.note)).toEqual(["n/a", "kept", "n/a"]);
  });

  test("computes the fill value per target", () => {
    const doc = createDoc();
    const f = createFillEmpty(doc);

    expectOk(f.fillEmpty<string>(TARGETS, { compute: (p) => `filled:${p}` }, { field: "/note" }));
    expect(doc.value.rows[0]!.note).toBe("filled:/rows/0/note");
    expect(doc.value.rows[1]!.note).toBe("kept");
  });

  test("a custom isEmpty controls what gets filled", () => {
    const doc = createDoc();
    const f = createFillEmpty(doc);

    // treat "kept" as empty too -> all three filled
    const result = expectOk(
      f.fillEmpty(TARGETS, { value: "x" }, { field: "/note", isEmpty: () => true }),
    );
    expect(result.filled).toBe(3);
  });

  test("all-non-empty is a no-op", () => {
    const doc = createJSONDocument(Schema, {
      rows: [
        { id: "a", note: "p" },
        { id: "b", note: "q" },
      ],
    });
    const f = createFillEmpty(doc);

    const result = expectOk(f.fillEmpty(["/rows/0", "/rows/1"], { value: "z" }, { field: "/note" }));
    expect(result.filled).toBe(0);
    expect(result.changed).toBe(false);
  });

  test("a schema-violating fill is rejected by canPatch", () => {
    const doc = createDoc();
    const f = createFillEmpty(doc);

    // note is a string; filling with a number must be rejected.
    const result = f.fillEmpty(TARGETS, { value: 123 }, { field: "/note" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
  });

  test("canFillEmpty does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canFillEmpty(doc, TARGETS, { value: "x" }, { field: "/note" }));
    expect(result.filled).toBe(2);
    expect(doc.value.rows[0]!.note).toBe("");
  });

  test("a missing target is rejected", () => {
    const doc = createDoc();
    const result = canFillEmpty(doc, ["/rows/9"], { value: "x" }, { field: "/note" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });

  test("empty targets are rejected", () => {
    const doc = createDoc();
    const result = canFillEmpty(doc, [], { value: "x" }, { field: "/note" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_targets");
  });
});
