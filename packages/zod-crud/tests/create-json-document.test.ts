import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.string()),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { foo: "bar" },
};

describe("createJSONDocument — headless facade", () => {
  test("matches the React facade surface without React", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "extended", initial: ["/items/0"] },
    });

    expect(doc.value.items).toHaveLength(2);
    expect(doc.selection?.focus).toBe("/items/0");
    expect(doc.can.copy("/items/0")).toBe(true);

    const copied = doc.commands.copy("/items/0");
    expect(copied.ok).toBe(true);
    expect(doc.history.canUndo).toBe(false);

    const cut = doc.commands.cut("/items/0");
    expect(cut.ok).toBe(true);
    expect(doc.value.items).toEqual([{ id: "b", name: "B" }]);
    expect(doc.history.canUndo).toBe(true);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value.items).toEqual(initial.items);
    expect(doc.history.canRedo).toBe(true);

    expect(doc.commands.redo()).toBe(true);
    expect(doc.value.items).toEqual([{ id: "b", name: "B" }]);
  });

  test("commits clipboard paste through the same history-aware path", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single" },
    });

    const result = doc.commands.paste({ id: "c", name: "C" }, "/items/-");

    expect(result.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(doc.selection?.focus).toBe("/items/2");
    expect(doc.history.undoDepth).toBe(1);

    doc.commands.undo();

    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(doc.history.redoDepth).toBe(1);
  });

  test("commands.select mutates document selection", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    const selected = doc.commands.select({ type: "addRange", pointer: "/items/0" }, "multiple");

    expect(selected.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.selectionRanges).toEqual([{ anchor: "/items/0", focus: "/items/0" }]);

    doc.commands.select({ type: "addRange", pointer: "/items/1" }, "multiple");

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(doc.selection?.primaryIndex).toBe(1);
  });

  test("JSONPoint caret tracks pointer movement while preserving offset", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single" },
    });

    doc.selection?.collapse({ path: "/items/1/name", offset: 1, affinity: "forward" });
    doc.ops.remove("/items/0");

    expect(doc.selection?.anchor).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(doc.selection?.focus).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0/name"]);
  });

  test("transaction collapses multiple ops into one undo entry", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.history.transaction(() => {
      doc.ops.replace("/items/0/name", "A1");
      doc.ops.replace("/items/1/name", "B1");
    });

    expect(doc.value.items.map((item) => item.name)).toEqual(["A1", "B1"]);
    expect(doc.history.undoDepth).toBe(1);

    doc.commands.undo();

    expect(doc.value.items.map((item) => item.name)).toEqual(["A", "B"]);
  });

  test("load history policy matches useJSONDocument", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.ops.replace("/items/0/name", "A1");
    expect(doc.history.canUndo).toBe(true);

    doc.ops.load({ ...initial, meta: { foo: "loaded" } }, { preserveHistory: true });
    expect(doc.history.canUndo).toBe(true);

    doc.ops.load(initial);
    expect(doc.history.canUndo).toBe(false);
  });
});
