import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

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
  test("groups reads under doc.read while preserving read aliases", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.read.at("/items/0/name")).toEqual({ ok: true, path: "/items/0/name", value: "A" });
    expect(doc.read.exists("/items/1")).toBe(true);
    expect(doc.read.query("$.items[*].id")).toEqual({
      ok: true,
      query: "$.items[*].id",
      pointers: ["/items/0/id", "/items/1/id"],
    });
    expect(doc.read.entries("/items")).toMatchObject({
      ok: true,
      path: "/items",
      kind: "array",
      entries: [
        { key: "0", path: "/items/0" },
        { key: "1", path: "/items/1" },
      ],
    });
    expect(doc.at("/items/0/name")).toEqual(doc.read.at("/items/0/name"));
  });

  test("plans and runs user intents through one surface", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0/name"] },
    });

    expect(doc.plan({ type: "replace", value: "A1" })).toEqual({ ok: true });
    expect(doc.run({ type: "replace", value: "A1" })).toEqual({ ok: true });
    expect(doc.value.items[0]?.name).toBe("A1");
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.plan({ type: "replace", path: "/items/0/name", value: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.value.items[0]?.name).toBe("A1");

    expect(doc.run({ type: "undo" })).toBe(true);
    expect(doc.value.items[0]?.name).toBe("A");
  });

  test("plans and runs clipboard intents without mixing buffer state into doc.commands", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.plan({ type: "paste", target: "/items/-" })).toEqual({
      ok: false,
      code: "empty_clipboard",
      reason: "clipboard is empty",
    });

    expect(doc.run({ type: "copy" })).toMatchObject({ ok: true, source: "/items/0" });
    expect(doc.clipboard.hasData).toBe(true);
    expect(doc.plan({ type: "paste", target: "/items/-" })).toEqual({ ok: true });

    expect(doc.run({ type: "paste", target: "/items/-" })).toMatchObject({ ok: true });
    expect(doc.value.items.map((item) => item.name)).toEqual(["A", "B", "A"]);
  });

  test("keeps raw JSON Patch as an explicit escape hatch", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch([{ op: "replace", path: "/items/1/name", value: "B1" }])).toEqual({ ok: true });

    expect(doc.value.items[1]?.name).toBe("B1");
    expect(doc.lastPatch).toEqual([{ op: "replace", path: "/items/1/name", value: "B1" }]);
    expect(doc.history.undoDepth).toBe(1);
  });
});
