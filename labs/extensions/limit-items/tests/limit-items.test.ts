import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canLimitItems, createLimitItems, type LimitItemsResult } from "../src/index.js";

const Schema = z.object({
  recent: z.array(z.string()),
  capped: z.array(z.string()).min(2),
});

function createDoc(recent = ["a", "b", "c", "d", "e"]) {
  return createJSONDocument(Schema, { recent, capped: ["x", "y", "z"] });
}

function expectOk<T>(result: LimitItemsResult<T>): Extract<LimitItemsResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/limit-items", () => {
  test("keeps the first max items by default", () => {
    const doc = createDoc();
    const l = createLimitItems(doc);

    const result = expectOk(l.limitItems("/recent", 3));
    expect(result.removed).toBe(2);
    expect(doc.value.recent).toEqual(["a", "b", "c"]);
  });

  test("keeps the last max items with from: end", () => {
    const doc = createDoc();
    const l = createLimitItems(doc);

    expectOk(l.limitItems("/recent", 2, { from: "end" }));
    expect(doc.value.recent).toEqual(["d", "e"]);
  });

  test("an array within the limit is a no-op", () => {
    const doc = createDoc(["a", "b"]);
    const l = createLimitItems(doc);

    const result = expectOk(l.limitItems("/recent", 5));
    expect(result.changed).toBe(false);
    expect(result.removed).toBe(0);
  });

  test("max 0 empties the array", () => {
    const doc = createDoc();
    const l = createLimitItems(doc);

    expectOk(l.limitItems("/recent", 0));
    expect(doc.value.recent).toEqual([]);
  });

  test("a limit below a schema minItems is rejected by canPatch", () => {
    const doc = createDoc();
    const l = createLimitItems(doc);

    // capped requires min 2; limiting to 1 must be rejected.
    const result = l.limitItems("/capped", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.capped).toEqual(["x", "y", "z"]);
  });

  test("canLimitItems does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canLimitItems(doc, "/recent", 1));
    expect(result.values).toEqual(["a"]);
    expect(doc.value.recent).toHaveLength(5);
  });

  test("rejects a negative or non-integer max", () => {
    const doc = createDoc();
    expect(canLimitItems(doc, "/recent", -1).ok).toBe(false);
    const r = canLimitItems(doc, "/recent", 1.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_max");
  });

  test("rejects a non-array path", () => {
    const doc = createDoc();
    const result = canLimitItems(doc, "/recent/0", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canLimitItems(doc, "/missing", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
