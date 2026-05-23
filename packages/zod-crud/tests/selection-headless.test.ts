import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";
import { expandRange } from "../src/domain/selection/range.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("JSONDocument selection interface", () => {
  test("collapsed range expansion does not walk document state", () => {
    const state = {
      keep: "value",
      get expensive() {
        throw new Error("collapsed range should not inspect siblings");
      },
    };

    expect(expandRange("/keep", "/keep", state)).toEqual(["/keep"]);
  });

  test("supports multiple explicit ranges without standalone selection factories", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    doc.selection?.addRange("/items/0");
    doc.selection?.addRange("/items/2/name");

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/2/name"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/2/name", focus: "/items/2/name" },
    ]);
    expect(doc.selection?.primaryPointer).toBe("/items/2/name");
    expect(doc.selection?.selectedSource).toEqual(["/items/0", "/items/2/name"]);
  });

  test("moves and extends cursors over explicit visible points", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "extended", initial: ["/items/0"] },
    });
    const points = ["/items/0", "/items/1", "/items/2"] as const;

    expect(doc.selection?.moveCursor("next", { points })).toMatchObject({
      ok: true,
      pointer: "/items/1",
    });
    expect(doc.selection?.primaryPointer).toBe("/items/1");

    expect(doc.selection?.extendCursor("next", { points })).toMatchObject({
      ok: true,
      pointer: "/items/2",
    });
    expect(doc.selection?.selectedPointers).toEqual(["/items/1", "/items/2"]);
  });

  test("selects query scopes and keeps snapshots serializable", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "extended" },
    });

    expect(doc.selection?.selectScope({ query: "$.items[*].name" })).toMatchObject({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0/name", "/items/1/name", "/items/2/name"]);

    const saved = JSON.parse(JSON.stringify(doc.selection));
    doc.selection?.empty();
    expect(doc.selection?.selectedPointers).toEqual([]);

    doc.selection?.restore(saved);
    expect(doc.selection?.snapshot()).toEqual(saved);
  });

  test("tracks selection through document patches", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/1"] },
    });

    doc.patch({ op: "remove", path: "/items/0" });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);

    doc.patch({ op: "remove", path: "/items/0" });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.primaryPointer).toBe("/items/0");
  });

  test("single selection batch auto-selects only the final surviving target", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    expect(doc.patch([
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "add", path: "/items/-", value: { id: "d", name: "D" } },
    ])).toEqual({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/items/4"]);

    expect(doc.patch([
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "add", path: "/items/-", value: { id: "e", name: "E" } },
      { op: "remove", path: "/items/6" },
    ])).toEqual({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/items/5"]);
  });

  test("multiple selection batch auto-selects all surviving targets", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    expect(doc.patch([
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "add", path: "/items/-", value: { id: "d", name: "D" } },
    ])).toEqual({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/items/1", "/items/4"]);
  });

  test("multiple selection append batch auto-selects increasing targets", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    expect(doc.patch([
      { op: "add", path: "/items/-", value: { id: "d", name: "D" } },
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "add", path: "/items/-", value: { id: "e", name: "E" } },
    ])).toEqual({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/items/3", "/items/4", "/items/5"]);
    expect(doc.selection?.primaryPointer).toBe("/items/5");
  });

  test("multiple selection append batch handles escaped array parents", () => {
    const EscapedSchema = z.object({
      "a/b": z.array(z.object({ id: z.string(), name: z.string() })),
    });
    const doc = createJSONDocument(EscapedSchema, {
      "a/b": initial.items,
    }, {
      selection: { mode: "multiple" },
    });

    expect(doc.patch([
      { op: "add", path: "/a~1b/-", value: { id: "d", name: "D" } },
      { op: "add", path: "/a~1b/-", value: { id: "e", name: "E" } },
    ])).toEqual({ ok: true });
    expect(doc.selection?.selectedPointers).toEqual(["/a~1b/3", "/a~1b/4"]);
    expect(doc.selection?.primaryPointer).toBe("/a~1b/4");
  });

  test("multiple auto-selection exposes defensive selected pointer arrays", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    expect(doc.patch([
      { op: "add", path: "/items/-", value: { id: "d", name: "D" } },
      { op: "add", path: "/items/-", value: { id: "e", name: "E" } },
    ])).toEqual({ ok: true });
    const selected = doc.selection?.selectedPointers as string[];
    selected.length = 0;

    expect(doc.selection?.selectedPointers).toEqual(["/items/3", "/items/4"]);
  });

  test("selection subscribers receive previous snapshots", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple", initial: ["/items/0"] },
    });
    const changes: unknown[] = [];
    const unsubscribe = doc.selection?.subscribe((snapshot, previous) => {
      changes.push({ snapshot, previous });
    });

    doc.selection?.addRange("/items/1");
    unsubscribe?.();

    expect(changes).toEqual([{
      previous: expect.objectContaining({
        selectedPointers: ["/items/0"],
      }),
      snapshot: expect.objectContaining({
        selectedPointers: ["/items/0", "/items/1"],
      }),
    }]);
  });

  test("multiple selection repeated move batch deduplicates targets and keeps current target primary", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    expect(doc.patch([
      { op: "move", from: "/items/1", path: "/items/0" },
      { op: "move", from: "/items/1", path: "/items/0" },
      { op: "move", from: "/items/1", path: "/items/0" },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.primaryPointer).toBe("/items/0");
  });

  test("builds text patches from selected string ranges", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/items/0/name", offset: 0 },
          focus: { path: "/items/0/name", offset: 1 },
        }],
      },
    });

    const planned = doc.selection?.textPatch("Alpha");
    expect(planned).toMatchObject({
      ok: true,
      pointers: ["/items/0/name"],
    });
    if (!planned?.ok) throw new Error("text patch did not plan");

    expect(doc.commit(planned.patch, { selection: planned.selection })).toEqual({ ok: true });
    expect(doc.value.items[0]?.name).toBe("Alpha");
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 5 });
  });
});
