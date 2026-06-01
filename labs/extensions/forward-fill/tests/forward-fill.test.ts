import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canForwardFill, createForwardFill, type ForwardFillResult } from "../src/index.js";

const Schema = z.object({
  rows: z.array(z.object({ group: z.string() })),
  flat: z.array(z.string()),
});

function createDoc() {
  return createJSONDocument(Schema, {
    rows: [
      { group: "A" },
      { group: "" },
      { group: "" },
      { group: "B" },
      { group: "" },
    ],
    flat: [],
  });
}

function expectOk(result: ForwardFillResult): Extract<ForwardFillResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/forward-fill", () => {
  test("carries the previous non-empty value forward (down)", () => {
    const doc = createDoc();
    const f = createForwardFill(doc);

    const result = expectOk(f.forwardFill("/rows", { field: "/group" }));
    expect(result.filled).toBe(3);
    expect(doc.value.rows.map((r) => r.group)).toEqual(["A", "A", "A", "B", "B"]);
  });

  test("leading empties (before any value) stay empty", () => {
    const doc = createJSONDocument(Schema, {
      rows: [{ group: "" }, { group: "X" }, { group: "" }],
      flat: [],
    });
    const f = createForwardFill(doc);

    expectOk(f.forwardFill("/rows", { field: "/group" }));
    expect(doc.value.rows.map((r) => r.group)).toEqual(["", "X", "X"]);
  });

  test("direction up carries the next value backward", () => {
    const doc = createJSONDocument(Schema, {
      rows: [{ group: "" }, { group: "X" }, { group: "" }, { group: "Y" }],
      flat: [],
    });
    const f = createForwardFill(doc);

    expectOk(f.forwardFill("/rows", { field: "/group", direction: "up" }));
    expect(doc.value.rows.map((r) => r.group)).toEqual(["X", "X", "Y", "Y"]);
  });

  test("fills a flat string array", () => {
    const doc = createJSONDocument(Schema, { rows: [], flat: ["a", "", "", "b", ""] });
    const f = createForwardFill(doc);

    expectOk(f.forwardFill("/flat"));
    expect(doc.value.flat).toEqual(["a", "a", "a", "b", "b"]);
  });

  test("no empties is a no-op", () => {
    const doc = createJSONDocument(Schema, { rows: [{ group: "A" }, { group: "B" }], flat: [] });
    const f = createForwardFill(doc);

    const result = expectOk(f.forwardFill("/rows", { field: "/group" }));
    expect(result.changed).toBe(false);
    expect(result.filled).toBe(0);
  });

  test("a custom isEmpty controls filling", () => {
    const doc = createJSONDocument(Schema, { flat: ["a", "-", "b"], rows: [] });
    const f = createForwardFill(doc);

    const result = expectOk(f.forwardFill("/flat", { isEmpty: (v) => v === "-" }));
    expect(result.filled).toBe(1);
    expect(doc.value.flat).toEqual(["a", "a", "b"]);
  });

  test("canForwardFill does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canForwardFill(doc, "/rows", { field: "/group" }));
    expect(result.filled).toBe(3);
    expect(doc.value.rows[1]!.group).toBe("");
  });

  test("rejects a non-array path", () => {
    const doc = createDoc();
    const result = canForwardFill(doc, "/rows/0");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canForwardFill(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
