import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canSwapItems, createSwapItems, type SwapItemsResult } from "../src/index.js";

const Schema = z.object({
  items: z.array(z.string()),
  other: z.array(z.string()),
});

function createDoc() {
  return createJSONDocument(Schema, { items: ["a", "b", "c", "d"], other: ["x"] });
}

function expectOk(result: SwapItemsResult): Extract<SwapItemsResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/swap-items", () => {
  test("swaps two items", () => {
    const doc = createDoc();
    const s = createSwapItems(doc);

    expectOk(s.swapItems("/items/0", "/items/2"));
    expect(doc.value.items).toEqual(["c", "b", "a", "d"]);
  });

  test("swapping adjacent items", () => {
    const doc = createDoc();
    const s = createSwapItems(doc);

    expectOk(s.swapItems("/items/1", "/items/2"));
    expect(doc.value.items).toEqual(["a", "c", "b", "d"]);
  });

  test("swapping an item with itself is a no-op", () => {
    const doc = createDoc();
    const s = createSwapItems(doc);

    const result = expectOk(s.swapItems("/items/1", "/items/1"));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("swapping equal values is a no-op", () => {
    const doc = createJSONDocument(Schema, { items: ["a", "a"], other: [] });
    const s = createSwapItems(doc);

    const result = expectOk(s.swapItems("/items/0", "/items/1"));
    expect(result.changed).toBe(false);
  });

  test("canSwapItems does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canSwapItems(doc, "/items/0", "/items/3"));
    expect(result.changed).toBe(true);
    expect(doc.value.items).toEqual(["a", "b", "c", "d"]);
  });

  test("rejects pointers in different parents", () => {
    const doc = createDoc();
    const result = canSwapItems(doc, "/items/0", "/other/0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("mixed_parent");
  });

  test("rejects a non array-item pointer", () => {
    const doc = createDoc();
    const result = canSwapItems(doc, "/items", "/items/0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array_item");
  });

  test("rejects an out-of-range index", () => {
    const doc = createDoc();
    const result = canSwapItems(doc, "/items/0", "/items/9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("index_out_of_range");
  });
});
