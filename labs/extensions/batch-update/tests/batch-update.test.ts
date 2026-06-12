import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canBatchUpdate, createBatchUpdate, type BatchUpdateResult } from "../src/index.js";

const Schema = z.object({
  rows: z.array(z.object({ id: z.string(), status: z.enum(["todo", "done"]), n: z.number() })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [
      { id: "a", status: "todo", n: 1 },
      { id: "b", status: "todo", n: 2 },
      { id: "c", status: "done", n: 3 },
    ],
  });
}

function expectOk(result: BatchUpdateResult): Extract<BatchUpdateResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-batch-update", () => {
  test("sets one field across selected items to a constant", () => {
    const doc = createDoc();
    const b = createBatchUpdate(doc);

    const result = expectOk(b.batchUpdate(["/rows/0", "/rows/1"], { value: "done" }, { field: "/status" }));
    expect(result.changed).toBe(2);
    expect(result.selectionAfter).toEqual(["/rows/0", "/rows/1"]);
    expect(doc.value.rows.map((r) => r.status)).toEqual(["done", "done", "done"]);
  });

  test("computes the value per target", () => {
    const doc = createDoc();
    const b = createBatchUpdate(doc);

    expectOk(
      b.batchUpdate<number>(["/rows/0", "/rows/2"], { compute: (current) => (current as number) * 10 }, { field: "/n" }),
    );
    expect(doc.value.rows.map((r) => r.n)).toEqual([10, 2, 30]);
  });

  test("only counts writes that change a value", () => {
    const doc = createDoc();
    const b = createBatchUpdate(doc);

    // row 2 is already "done"; setting all three to "done" changes only two.
    const result = expectOk(b.batchUpdate(["/rows/0", "/rows/1", "/rows/2"], { value: "done" }, { field: "/status" }));
    expect(result.count).toBe(3);
    expect(result.changed).toBe(2);
  });

  test("replaces whole items when no field is given", () => {
    const doc = createDoc();
    const b = createBatchUpdate(doc);

    expectOk(b.batchUpdate(["/rows/1"], { value: { id: "b", status: "done", n: 9 } }));
    expect(doc.value.rows[1]).toEqual({ id: "b", status: "done", n: 9 });
  });

  test("a schema-violating value is rejected by canPatch, nothing applied", () => {
    const doc = createDoc();
    const b = createBatchUpdate(doc);

    const result = b.batchUpdate(["/rows/0", "/rows/1"], { value: "nope" }, { field: "/status" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.rows.map((r) => r.status)).toEqual(["todo", "todo", "done"]);
  });

  test("canBatchUpdate does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canBatchUpdate(doc, ["/rows/0"], { value: "done" }, { field: "/status" }));
    expect(result.changed).toBe(1);
    expect(doc.value.rows[0]!.status).toBe("todo");
  });

  test("a missing target is rejected", () => {
    const doc = createDoc();
    const result = canBatchUpdate(doc, ["/rows/0", "/rows/9"], { value: "done" }, { field: "/status" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });

  test("empty targets are rejected", () => {
    const doc = createDoc();
    const result = canBatchUpdate(doc, [], { value: "done" }, { field: "/status" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_targets");
  });

  test("a compute that throws is reported", () => {
    const doc = createDoc();
    const result = canBatchUpdate(doc, ["/rows/0"], {
      compute: () => {
        throw new Error("boom");
      },
    }, { field: "/n" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("value_failed");
  });
});
