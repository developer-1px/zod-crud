import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/api/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

describe("JSONDocument interface", () => {
  test("reads through direct document queries", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.at("/items/0/name")).toEqual({ ok: true, path: "/items/0/name", value: "A" });
    expect(doc.exists("/items/1")).toBe(true);
    expect(doc.query("$.items[*].id")).toEqual({
      ok: true,
      query: "$.items[*].id",
      pointers: ["/items/0/id", "/items/1/id"],
    });
    expect(doc.entries("/items")).toMatchObject({
      ok: true,
      path: "/items",
      kind: "array",
      entries: [
        { key: "0", path: "/items/0" },
        { key: "1", path: "/items/1" },
      ],
    });
  });

  test("checks capabilities through flat can methods", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0/name"] },
    });

    expect(doc.canReplace("/items/0/name", "A1")).toEqual({ ok: true });
    expect(doc.canReplace("/items/0/name", 1)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.canCopy("/items/0")).toEqual({ ok: true });
    expect(doc.canCut("/items/0")).toEqual({ ok: true });
    expect(doc.canPastePayload("/items/-", { id: "c", name: "C" })).toEqual({ ok: true });
    expect(doc.canUndo()).toEqual({ ok: false, code: "empty_stack", reason: "undo stack is empty" });

    expect(doc.patch({ op: "replace", path: "/items/0/name", value: "A1" })).toEqual({ ok: true });
    expect(doc.value.items[0]?.name).toBe("A1");
    expect(doc.history.undoDepth).toBe(1);
    expect(doc.canUndo()).toEqual({ ok: true });

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.items[0]?.name).toBe("A");
  });

  test("uses explicit selection sources for clipboard and history", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.clipboard.copy(doc.selection?.primaryPointer ?? "/items/0")).toMatchObject({
      ok: true,
      source: "/items/0",
    });
    expect(doc.clipboard.hasData).toBe(true);

    expect(doc.clipboard.paste("/items/-")).toMatchObject({ ok: true });
    expect(doc.value.items.map((item) => item.name)).toEqual(["A", "B", "A"]);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.items.map((item) => item.name)).toEqual(["A", "B"]);
    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.name)).toEqual(["A", "B", "A"]);
  });

  test("keeps raw JSON Patch as an explicit escape hatch", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch({ op: "replace", path: "/items/1/name", value: "B1" })).toEqual({ ok: true });

    expect(doc.value.items[1]?.name).toBe("B1");
    expect(doc.lastPatch).toEqual([{ op: "replace", path: "/items/1/name", value: "B1" }]);
    expect(doc.history.undoDepth).toBe(1);
  });
});
