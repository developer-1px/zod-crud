import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canSplit, createSplitText, type SplitTextResult } from "../src/index.js";

const Schema = z.object({
  tags: z.array(z.string()),
  count: z.number(),
});

function createDoc(tags: string[] = []) {
  return createJSONDocument(Schema, { tags, count: 1 });
}

function expectOk(result: SplitTextResult): Extract<SplitTextResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-split-text", () => {
  test("splits a comma list into trimmed parts", () => {
    const doc = createDoc();
    const s = createSplitText(doc);

    const result = expectOk(s.split("/tags", "a, b ,c"));
    expect(result.parts).toEqual(["a", "b", "c"]);
    expect(doc.value.tags).toEqual(["a", "b", "c"]);
  });

  test("drops empty parts by default", () => {
    const doc = createDoc();
    const s = createSplitText(doc);

    expectOk(s.split("/tags", "a,,b, ,c"));
    expect(doc.value.tags).toEqual(["a", "b", "c"]);
  });

  test("supports a custom delimiter and regex", () => {
    const doc = createDoc();
    const s = createSplitText(doc);

    expectOk(s.split("/tags", "a;b|c", { delimiter: /[;|]/ }));
    expect(doc.value.tags).toEqual(["a", "b", "c"]);
  });

  test("dedupes when asked", () => {
    const doc = createDoc();
    const s = createSplitText(doc);

    const result = expectOk(s.split("/tags", "a,b,a,c,b", { dedupe: true }));
    expect(result.parts).toEqual(["a", "b", "c"]);
  });

  test("appends to the existing array", () => {
    const doc = createDoc(["x"]);
    const s = createSplitText(doc);

    expectOk(s.split("/tags", "a,b", { append: true }));
    expect(doc.value.tags).toEqual(["x", "a", "b"]);
  });

  test("keeps empties when dropEmpty is false", () => {
    const doc = createDoc();
    const s = createSplitText(doc);

    const result = expectOk(s.split("/tags", "a,,b", { dropEmpty: false }));
    expect(result.parts).toEqual(["a", "", "b"]);
  });

  test("an identical result is a no-op", () => {
    const doc = createDoc(["a", "b"]);
    const s = createSplitText(doc);

    const result = expectOk(s.split("/tags", "a,b"));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("canSplit does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canSplit(doc, "/tags", "a,b"));
    expect(result.parts).toEqual(["a", "b"]);
    expect(doc.value.tags).toEqual([]);
  });

  test("rejects a non-array path", () => {
    const doc = createDoc();
    const result = canSplit(doc, "/count", "a,b");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canSplit(doc, "/missing", "a,b");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
