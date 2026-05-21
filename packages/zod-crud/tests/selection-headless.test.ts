import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument, createSelection } from "../src/index.js";

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

describe("createSelection", () => {
  test("moves and extends a headless cursor through JSON source order", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, { mode: "extended" });
    const changes: unknown[] = [];
    selection.subscribe((snapshot, previous) => {
      changes.push({ snapshot, previous });
    });

    expect(selection.moveCursor("first", { scope: "/items", includeScope: false })).toMatchObject({
      ok: true,
      pointer: "/items/0",
      previousPointer: null,
    });
    expect(selection.caretPointer).toBe("/items/0");

    expect(selection.moveCursor("next", { scope: "/items", includeScope: false })).toMatchObject({
      ok: true,
      pointer: "/items/0/id",
      previousPointer: "/items/0",
    });
    expect(selection.caretPointer).toBe("/items/0/id");

    expect(selection.extendCursor("next", { scope: "/items", includeScope: false })).toMatchObject({
      ok: true,
      pointer: "/items/0/name",
      previousPointer: "/items/0/id",
    });
    expect(selection.selectionRanges).toEqual([{ anchor: "/items/0/id", focus: "/items/0/name" }]);
    expect(selection.selectedPointers).toEqual(["/items/0/id", "/items/0/name"]);

    expect(selection.resolveCursor("last", { scope: "/items", includeScope: false })).toMatchObject({
      ok: true,
      pointer: "/items/2/name",
      previousPointer: "/items/0/name",
    });
    expect(selection.focusPointer).toBe("/items/0/name");

    expect(changes).toHaveLength(3);
  });

  test("stores JSON-serializable selection context with snapshot semantics", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "single",
      context: { marks: ["bold"], intent: "insert" },
    });
    const changes: unknown[] = [];
    selection.subscribe((snapshot, previous) => changes.push({ snapshot, previous }));

    expect(selection.context).toEqual({ marks: ["bold"], intent: "insert" });

    selection.collapse({ path: "/items/0/name", offset: 1 });
    expect(selection.caret).toEqual({ path: "/items/0/name", offset: 1 });
    expect(selection.context).toEqual({ marks: ["bold"], intent: "insert" });

    const snapshot = selection.snapshot();
    expect(snapshot.context).toEqual({ marks: ["bold"], intent: "insert" });
    ((snapshot.context as { marks: string[] }).marks).push("italic");
    expect(selection.context).toEqual({ marks: ["bold"], intent: "insert" });

    selection.setContext({ marks: ["italic"] });
    expect(selection.context).toEqual({ marks: ["italic"] });

    selection.clearContext();
    expect(selection.context).toBeUndefined();
    expect(selection.snapshot()).not.toHaveProperty("context");
    expect(changes).toHaveLength(3);
  });

  test("rejects non-JSON selection context", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops);

    expect(() => selection.setContext({ bad: () => undefined } as never)).toThrow(TypeError);
  });

  test("orders ranges and projects spans through selection methods", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: [
        { anchor: "/items/2/name", focus: "/items/1/name" },
        { anchor: { path: "/items/0/name", offset: 1 }, focus: { path: "/items/0/name", offset: 0 } },
        "/items/1/id",
      ],
    });

    expect(selection.orderPrimaryRange()).toMatchObject({
      ok: true,
      range: {
        start: "/items/1/id",
        end: "/items/1/id",
      },
    });

    expect(selection.orderRanges({
      points: [
        { path: "/items/0/name", offset: 0 },
        { path: "/items/0/name", offset: 1 },
        "/items/1/id",
        "/items/1/name",
        "/items/2/name",
      ],
    })).toMatchObject({
      ok: true,
      ranges: [
        { index: 1, start: { path: "/items/0/name", offset: 0 } },
        { index: 2, start: "/items/1/id" },
        { index: 0, start: "/items/1/name" },
      ],
    });

    const spanSelection = createSelection(doc.ops, {
      mode: "extended",
      initial: [{
        anchor: { path: "/items/0/name", offset: 0 },
        focus: { path: "/items/2/name", offset: 1 },
      }],
    });

    expect(spanSelection.spansForPointer("/items/2/name", { query: "$.items[*].name" })).toMatchObject({
      ok: true,
      spans: [{ startOffset: 0, endOffset: 1, full: true }],
    });
    expect(spanSelection.spansForPointer("/items/0/id", { query: "$.items[*].name" })).toEqual({
      ok: true,
      pointer: "/items/0/id",
      spans: [],
    });
  });

  test("supports app-provided lengths for non-string offset domains", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "extended",
      initial: [{
        anchor: { path: "/items/0", offset: 2 },
        focus: { path: "/items/2", offset: 3 },
      }],
    });

    expect(selection.spansForPointer("/items/1", {
      getLength(pointer) {
        return pointer === "/items/1" ? 5 : null;
      },
    })).toMatchObject({
      ok: true,
      spans: [{
        start: { path: "/items/1", edge: "before" },
        end: { path: "/items/1", edge: "after" },
        startOffset: 0,
        endOffset: 5,
        full: true,
      }],
    });
  });

  test("plans text replacement patches and preserves selection context", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "extended",
      context: { marks: ["bold"] },
      initial: [{
        anchor: { path: "/items/0/name", offset: 0 },
        focus: { path: "/items/0/name", offset: 1 },
      }],
    });

    expect(selection.textEdits("AX")).toMatchObject({
      ok: true,
      edits: [{
        pointer: "/items/0/name",
        startOffset: 0,
        endOffset: 1,
        replacement: "AX",
      }],
    });
    expect(selection.textPatch("AX")).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/items/0/name", value: "AX" }],
      selection: {
        focus: { path: "/items/0/name", offset: 2 },
        context: { marks: ["bold"] },
      },
    });
  });

  test("builds multi-cursor string replacement patches in document order", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: [
        {
          anchor: { path: "/items/1/name", offset: 1 },
          focus: { path: "/items/1/name", offset: 1 },
        },
        {
          anchor: { path: "/items/0/name", offset: 1 },
          focus: { path: "/items/0/name", offset: 1 },
        },
      ],
    });

    expect(selection.textPatch("!")).toMatchObject({
      ok: true,
      patch: [
        { op: "replace", path: "/items/0/name", value: "A!" },
        { op: "replace", path: "/items/1/name", value: "B!" },
      ],
      pointers: ["/items/0/name", "/items/1/name"],
      selection: {
        selectedPointers: ["/items/0/name", "/items/1/name"],
        focus: { path: "/items/0/name", offset: 2 },
      },
    });
  });

  test("reports text replacement and deletion failures through selection methods", () => {
    const doc = createJSONDocument(Schema, initial);
    const objectSelection = createSelection(doc.ops, {
      mode: "single",
      initial: [{
        anchor: { path: "/items/0", edge: "before" },
        focus: { path: "/items/0", edge: "after" },
      }],
    });

    expect(objectSelection.textEdits("x", { points: ["/items/0"] })).toMatchObject({
      ok: false,
      code: "missing_length",
      pointer: "/items/0",
      index: 0,
    });

    const pointSelection = createSelection(doc.ops, {
      mode: "single",
      initial: [{
        anchor: { path: "/items/0/name", offset: 0 },
        focus: { path: "/items/0/name", offset: 0 },
      }],
    });

    expect(pointSelection.deleteText()).toMatchObject({
      ok: false,
      code: "cursor_boundary",
      pointer: "/items/0/name",
      index: 0,
    });
  });

  test("selects scopes, explicit visible points, and JSONPath matches", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, { mode: "multiple" });

    expect(selection.selectScope({ scope: "/items", includeScope: false })).toMatchObject({ ok: true });
    expect(selection.selectedPointers).toEqual([
      "/items/0",
      "/items/0/id",
      "/items/0/name",
      "/items/1",
      "/items/1/id",
      "/items/1/name",
      "/items/2",
      "/items/2/id",
      "/items/2/name",
    ]);
    expect(selection.primaryPointer).toBe("/items/2/name");

    expect(selection.selectScope({ points: ["/items/2", "/items/0"], primaryIndex: 0 })).toMatchObject({
      ok: true,
      points: ["/items/2", "/items/0"],
    });
    expect(selection.selectedPointers).toEqual(["/items/2", "/items/0"]);
    expect(selection.primaryPointer).toBe("/items/2");

    expect(selection.selectScope({ query: "$.items[*].id" })).toMatchObject({
      ok: true,
      points: ["/items/0/id", "/items/1/id", "/items/2/id"],
    });
    expect(selection.selectedPointers).toEqual(["/items/0/id", "/items/1/id", "/items/2/id"]);

    expect(selection.resolveScope({ query: "$.items[" })).toMatchObject({
      ok: false,
      code: "syntax_error",
      pointer: null,
    });
    expect(selection.resolveScope({ points: [] })).toMatchObject({
      ok: false,
      code: "empty_scope",
      pointer: "",
    });
  });

  test("tracks multi-selection over JSON ops and stops after dispose", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: ["/items/0"],
    });
    const changes: unknown[] = [];
    selection.subscribe((snapshot, previous) => {
      changes.push({ snapshot, previous });
    });

    expect(selection.selectedPointers).toEqual(["/items/0"]);
    expect(selection.primaryPointer).toBe("/items/0");

    selection.addRange({ path: "/items/1/name", offset: 99, affinity: "forward" });

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(selection.primaryRange).toEqual({
      anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
      focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
    });
    expect(selection.selectedSource).toEqual(["/items/0", "/items/1/name"]);

    doc.ops.remove("/items/0");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/0/name"]);
    expect(selection.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/0/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/0/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(JSON.parse(JSON.stringify(selection))).toEqual(selection.snapshot());
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      previous: { selectedPointers: ["/items/0"] },
      snapshot: { selectedPointers: ["/items/0", "/items/1/name"] },
    });

    selection.dispose();
    doc.ops.remove("/items/0");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/0/name"]);
    expect(changes).toHaveLength(2);
  });

  test("togglePointer toggles item selection without rebuilding an expanded range", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, { mode: "extended" });

    selection.setBaseAndExtent("/items/0", "/items/2");
    expect(selection.selectedPointers).toEqual(["/items/0", "/items/1", "/items/2"]);

    selection.togglePointer("/items/1");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/2"]);
    expect(selection.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/2", focus: "/items/2" },
    ]);
    expect(selection.primaryPointer).toBe("/items/2");

    selection.togglePointer("/items/1");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/2", "/items/1"]);
    expect(selection.primaryPointer).toBe("/items/1");
  });
});
