import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canDedupe, createDedupe, type DedupeResult } from "../src/index.js";

const Schema = z.object({
  tags: z.array(z.string()),
  rows: z.array(z.object({ id: z.string(), label: z.string() })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    tags: ["a", "b", "a", "c", "b", "a"],
    rows: [
      { id: "1", label: "x" },
      { id: "2", label: "y" },
      { id: "1", label: "z" },
      { id: "3", label: "w" },
    ],
  });
}

function expectOk<T>(result: DedupeResult<T>): Extract<DedupeResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-dedupe", () => {
  test("removes whole-value duplicates, keeping first occurrence", () => {
    const doc = createDoc();
    const d = createDedupe(doc);

    const result = expectOk(d.dedupe("/tags"));
    expect(result.removed).toBe(3);
    expect(result.removedIndices).toEqual([2, 4, 5]);
    expect(doc.value.tags).toEqual(["a", "b", "c"]);
  });

  test("dedupes objects by a host keyOf, keeping the first", () => {
    const doc = createDoc();
    const d = createDedupe(doc);

    const result = expectOk(d.dedupe<{ id: string; label: string }>("/rows", { keyOf: (row) => row.id }));
    expect(result.removed).toBe(1);
    expect(result.removedIndices).toEqual([2]);
    expect(doc.value.rows.map((row) => row.id)).toEqual(["1", "2", "3"]);
    // first occurrence kept (label "x", not "z")
    expect(doc.value.rows[0]).toEqual({ id: "1", label: "x" });
  });

  test("whole-value equality treats different objects with same key as distinct", () => {
    const doc = createDoc();
    const d = createDedupe(doc);

    // No keyOf: rows are distinct by whole value, so nothing removed.
    const result = expectOk(d.dedupe("/rows"));
    expect(result.changed).toBe(false);
    expect(result.removed).toBe(0);
  });

  test("canDedupe does not mutate the document", () => {
    const doc = createDoc();
    const result = expectOk(canDedupe(doc, "/tags"));
    expect(result.changed).toBe(true);
    expect(result.values).toEqual(["a", "b", "c"]);
    expect(doc.value.tags).toEqual(["a", "b", "a", "c", "b", "a"]);
  });

  test("an array with no duplicates is a no-op", () => {
    const doc = createJSONDocument(Schema, { tags: ["a", "b", "c"], rows: [] });
    const d = createDedupe(doc);

    const result = expectOk(d.dedupe("/tags"));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("a non-array path is rejected", () => {
    const doc = createDoc();
    const result = canDedupe(doc, "/rows/0/id");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("a missing path is rejected", () => {
    const doc = createDoc();
    const result = canDedupe(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });

  test("a keyOf that throws is reported", () => {
    const doc = createDoc();
    const result = canDedupe(doc, "/rows", {
      keyOf: () => {
        throw new Error("boom");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("key_failed");
  });
});
