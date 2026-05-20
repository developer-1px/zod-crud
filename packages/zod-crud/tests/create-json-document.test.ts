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

  test("doc.clipboard copies, pastes, and exposes serializable items", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.hasData).toBe(false);
    expect(doc.clipboard.read()).toEqual({ ok: false, code: "empty_clipboard", message: "clipboard is empty" });

    const copied = doc.clipboard.copy("/items/0");
    expect(copied.ok).toBe(true);
    expect(doc.clipboard.hasData).toBe(true);
    expect(doc.clipboard.source).toBe("/items/0");
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
    expect(doc.clipboard.toItems({ json: true })).toMatchObject({
      "application/json": "{\"id\":\"a\",\"name\":\"A\"}",
      "text/plain": "{\"id\":\"a\",\"name\":\"A\"}",
    });

    const pasted = doc.clipboard.paste("/items/-");

    expect(pasted.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "a"]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("doc.clipboard cut writes buffer and undo restores document", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    const cut = doc.clipboard.cut("/items/0");

    expect(cut.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["b"]);
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("doc.clipboard failed paste preserves buffer and document", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    doc.clipboard.copy("/items/0");

    const failed = doc.clipboard.paste("/meta/foo", "replace");

    expect(failed.ok).toBe(false);
    expect(doc.value).toEqual(initial);
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
    expect(doc.history.undoDepth).toBe(0);
  });

  test("doc.clipboard write rejects non-JSON without clearing existing buffer", () => {
    const doc = createJSONDocument(Schema, initial);
    doc.clipboard.write({ ok: true });

    const failed = doc.clipboard.write({ bad: undefined });

    expect(failed).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { ok: true },
      source: null,
      sources: null,
    });
  });

  test("doc.clipboard write normalizes and validates source metadata", () => {
    const doc = createJSONDocument(Schema, initial);

    const written = doc.clipboard.write(
      { id: "a", name: "A" },
      { source: "/items/0/name", sources: ["/items/0", "/items/0"] },
    );

    expect(written).toEqual({ ok: true });
    expect(doc.clipboard.source).toBe("/items/0");
    expect(doc.clipboard.sources).toEqual(["/items/0"]);
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });

    const failed = doc.clipboard.write({ id: "bad", name: "Bad" }, { source: "items/0" });

    expect(failed).toMatchObject({ ok: false, code: "invalid_pointer", pointer: "items/0" });
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
  });

  test("commands.select mutates document selection", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    const selected = doc.commands.select({ type: "addRange", pointer: "/items/0" });

    expect(selected.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.selectionRanges).toEqual([{ anchor: "/items/0", focus: "/items/0" }]);
    expect(doc.selection?.primaryRange).toEqual({ anchor: "/items/0", focus: "/items/0" });
    expect(doc.selection?.primaryPointer).toBe("/items/0");
    expect(doc.selection?.caret).toBe("/items/0");
    expect(doc.selection?.caretPointer).toBe("/items/0");

    doc.commands.select({ type: "addRange", pointer: "/items/1" });

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(doc.selection?.primaryIndex).toBe(1);
    expect(doc.selection?.rangeCount).toBe(2);
    expect(doc.selection?.selectedCount).toBe(2);
    expect(doc.selection?.hasSelection).toBe(true);
    expect(doc.selection?.isSelected("/items/0")).toBe(true);
    expect(doc.selection?.isSelected("/items/1")).toBe(true);
    expect(doc.selection?.isSelected("/meta/foo")).toBe(false);
    expect(doc.selection?.containsNode("/items/0")).toBe(true);
    expect(doc.selection?.primaryRange).toEqual({ anchor: "/items/1", focus: "/items/1" });
    expect(doc.selection?.anchorPointer).toBe("/items/1");
    expect(doc.selection?.focusPointer).toBe("/items/1");
    expect(doc.selection?.selectedSource).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.primaryPointer).toBe("/items/1");
    expect(doc.selection?.caret).toBe(null);
    expect(doc.selection?.caretPointer).toBe(null);
  });

  test("selection selectRanges dedupes repeated ranges", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    doc.selection?.selectRanges(["/items/0", "/items/1", "/items/0"], undefined, undefined, 2);

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(doc.selection?.primaryIndex).toBe(0);
    expect(doc.selection?.primaryPointer).toBe("/items/0");
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
    expect(doc.selection?.rangeCount).toBe(1);
    expect(doc.selection?.selectedCount).toBe(1);
    expect(doc.selection?.hasSelection).toBe(true);
    expect(doc.selection?.isSelected("/items/0/name")).toBe(true);
    expect(doc.selection?.anchorPointer).toBe("/items/0/name");
    expect(doc.selection?.focusPointer).toBe("/items/0/name");
    expect(doc.selection?.selectedSource).toBe("/items/0/name");
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(doc.selection?.caretPointer).toBe("/items/0/name");
    expect(doc.selection?.selectedPointers).toEqual(["/items/0/name"]);
  });

  test("JSONPoint caret offsets are clamped to string length", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    doc.selection?.collapse({ path: "/items/0/name", offset: 99, affinity: "forward" });

    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(doc.selection?.selectionRanges).toEqual([{
      anchor: { path: "/items/0/name", offset: 1, affinity: "forward" },
      focus: { path: "/items/0/name", offset: 1, affinity: "forward" },
    }]);
  });

  test("JSONPoint caret offsets stay valid after string edits", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    doc.selection?.collapse({ path: "/items/0/name", offset: 1, affinity: "backward" });
    doc.ops.replace("/items/0/name", "");

    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 0, affinity: "backward" });
    expect(doc.selection?.caretPointer).toBe("/items/0/name");
  });

  test("selection getters and snapshot expose value copies", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });
    const point = { path: "/items/0/name" as const, offset: 1, affinity: "forward" as const };

    doc.selection?.collapse(point);
    point.offset = 99;
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const caret = doc.selection?.caret;
    if (caret === undefined || caret === null || typeof caret === "string") throw new Error("expected JSONPoint object");
    caret.offset = 88;
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const primaryRange = doc.selection?.primaryRange;
    if (primaryRange === undefined || primaryRange === null || typeof primaryRange.anchor === "string") {
      throw new Error("expected JSONPoint object");
    }
    primaryRange.anchor.offset = 66;
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const selectionRange = doc.selection?.selectionRanges[0];
    if (selectionRange === undefined || typeof selectionRange.anchor === "string") {
      throw new Error("expected JSONPoint object");
    }
    selectionRange.anchor.offset = 55;
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const snapshot = doc.selection?.snapshot();
    const snapshotAnchor = snapshot?.selectionRanges[0]?.anchor;
    if (snapshotAnchor === undefined || typeof snapshotAnchor === "string") throw new Error("expected JSONPoint object");
    snapshotAnchor.offset = 77;
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const selectedPointers = doc.selection?.selectedPointers as unknown as string[];
    selectedPointers.push("/items/1");
    expect(doc.selection?.selectedPointers).toEqual(["/items/0/name"]);
  });

  test("selection primaryPointer can drive headless clipboard commands", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/1"] },
    });

    const source = doc.selection?.primaryPointer;
    expect(source).toBe("/items/1");
    expect(doc.selection?.selectedSource).toBe("/items/1");

    const copied = source ? doc.commands.copy(source) : { ok: false as const };

    expect(copied).toMatchObject({
      ok: true,
      payload: { id: "b", name: "B" },
      source: "/items/1",
    });
  });

  test("selection selectedPointers can drive multi-source headless clipboard commands", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "multiple", initial: ["/items/0", "/items/1"] },
    });

    const sources = doc.selection?.selectedSource;
    expect(sources).toEqual(["/items/0", "/items/1"]);
    if (!sources) throw new Error("expected selected source");
    const copied = doc.commands.copy(sources);

    expect(copied).toMatchObject({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });

    const cut = doc.commands.cut(sources);

    expect(cut).toMatchObject({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      sources: ["/items/0", "/items/1"],
    });
    expect(doc.value.items).toEqual([]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("multi-source cut recovers selection without duplicate ranges", () => {
    const doc = createJSONDocument(Schema, {
      items: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      meta: { foo: "bar" },
    }, {
      history: 10,
      selection: { mode: "multiple", initial: ["/items/0", "/items/1"] },
    });

    const cut = doc.commands.cut(doc.selection?.selectedPointers ?? []);

    expect(cut.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["c"]);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.selectionRanges).toEqual([{ anchor: "/items/0", focus: "/items/0" }]);
    expect(doc.selection?.primaryIndex).toBe(0);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.commands.redo()).toBe(true);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
  });

  test("doc.clipboard accepts multi-source copy/cut buffers", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    const copied = doc.clipboard.copy(["/items/0", "/items/1"]);

    expect(copied.ok).toBe(true);
    expect(doc.clipboard.source).toBe("/items/0");
    expect(doc.clipboard.sources).toEqual(["/items/0", "/items/1"]);
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });
    expect(doc.clipboard.toItems({ tsv: true })["text/plain"]).toBe("id\tname\na\tA\nb\tB");

    const pasted = doc.clipboard.paste("/items/-");

    expect(pasted.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "a", "b"]);
    doc.commands.undo();
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);

    const cut = doc.clipboard.cut(["/items/0", "/items/1"]);

    expect(cut.ok).toBe(true);
    expect(doc.value.items).toEqual([]);
    expect(doc.clipboard.sources).toEqual(["/items/0", "/items/1"]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("doc.clipboard paste options can keep a multi-source payload as one array item", () => {
    const Item = z.object({ id: z.string(), name: z.string() });
    const GroupSchema = z.object({
      items: z.array(Item),
      groups: z.array(z.array(Item)),
    });
    const doc = createJSONDocument(GroupSchema, { items: initial.items, groups: [] }, { history: 10 });

    doc.clipboard.copy(["/items/0", "/items/1"]);

    const defaultSpread = doc.clipboard.paste("/groups/-");
    expect(defaultSpread.ok).toBe(false);
    if (!defaultSpread.ok) expect(defaultSpread.code).toBe("schema_violation");
    expect(doc.value.groups).toEqual([]);

    const pasted = doc.clipboard.paste("/groups/-", "into", { spread: false });

    expect(pasted.ok).toBe(true);
    expect(doc.value.groups).toEqual([initial.items]);
    expect(doc.history.undoDepth).toBe(1);
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
