// Sibling-range normalization — pure path arithmetic, no document access.
// See docs/standard/contract-pressure-register.md "sibling-range 정규화" (RFC #87).

import { describe, expect, test } from "vitest";
import { resolveSiblingRange } from "../../../src/index.js";

describe("resolveSiblingRange", () => {
  test("shares the parent and sorts by index", () => {
    const result = resolveSiblingRange(["/rows/2", "/rows/0", "/rows/1"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parent).toBe("/rows");
    expect(result.locations.map((location) => location.index)).toEqual([0, 1, 2]);
    expect(result.contiguous).toBe(true);
  });

  test("reports contiguous: false for gapped indices without failing", () => {
    const result = resolveSiblingRange(["/rows/0", "/rows/2"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contiguous).toBe(false);
  });

  test("requireContiguous turns a gap into a non_contiguous error", () => {
    const result = resolveSiblingRange(["/rows/0", "/rows/2"], { requireContiguous: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("non_contiguous");
  });

  test("accepts a single pointer", () => {
    const result = resolveSiblingRange("/rows/3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parent).toBe("/rows");
    expect(result.locations).toHaveLength(1);
  });

  test("dedupes by default", () => {
    const result = resolveSiblingRange(["/rows/0", "/rows/0", "/rows/1"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.locations).toHaveLength(2);
  });

  test("dedupe: false keeps duplicates (and reports non-contiguous)", () => {
    const result = resolveSiblingRange(["/rows/0", "/rows/0", "/rows/1"], { dedupe: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.locations).toHaveLength(3);
    expect(result.contiguous).toBe(false);
  });

  test("pruneDescendants drops pointers nested under another selected pointer", () => {
    const result = resolveSiblingRange(["/rows/0", "/rows/0/child/1"], { pruneDescendants: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.locations.map((location) => location.pointer)).toEqual(["/rows/0"]);
  });

  test("rejects an empty selection", () => {
    const result = resolveSiblingRange([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("empty_selection");
  });

  test("rejects an invalid pointer", () => {
    const result = resolveSiblingRange(["rows/0"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_pointer");
  });

  test("rejects a non array-item pointer", () => {
    const result = resolveSiblingRange(["/rows"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_array_item");
  });

  test("rejects a mixed parent selection", () => {
    const result = resolveSiblingRange(["/rows/0", "/other/0"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mixed_parent");
  });

  test("rejects an object-key pointer as not an array item", () => {
    const result = resolveSiblingRange(["/meta/title"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_array_item");
  });
});
