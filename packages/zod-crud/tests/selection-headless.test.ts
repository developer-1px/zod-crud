import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  EMPTY_SELECTION,
  compareSelectionPoints,
  createJSONDocument,
  createSelection,
  deleteSelectionText,
  extendSelectionCursor,
  moveSelectionCursor,
  orderPrimarySelectionRange,
  orderSelectionRange,
  orderSelectionRanges,
  primaryPointer,
  replaceSelectionText,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectSelectionScope,
  selectionSpansForPointer,
  selectionTextEdits,
} from "../src/index.js";

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

  test("cursor helpers are pure and report scope/boundary failures", () => {
    const first = moveSelectionCursor(
      EMPTY_SELECTION,
      "first",
      "single",
      initial,
      { scope: "/items", includeScope: false },
    );
    expect(first).toMatchObject({ ok: true, pointer: "/items/0" });
    if (!first.ok) throw new Error(first.reason);

    const next = moveSelectionCursor(first.selection, "next", "single", initial, { scope: "/items" });
    expect(next).toMatchObject({ ok: true, pointer: "/items/0/id" });
    if (!next.ok) throw new Error(next.reason);

    const extended = extendSelectionCursor(next.selection, "last", "extended", initial, { scope: "/items" });
    expect(extended).toMatchObject({ ok: true, pointer: "/items/2/name" });
    if (!extended.ok) throw new Error(extended.reason);
    expect(extended.selection.selectionRanges).toEqual([{ anchor: "/items/0/id", focus: "/items/2/name" }]);

    const boundary = moveSelectionCursor(extended.selection, "next", "single", initial, { scope: "/items" });
    expect(boundary).toMatchObject({
      ok: false,
      code: "cursor_boundary",
      pointer: "/items/2/name",
    });
    if (boundary.ok) throw new Error("expected boundary");
    expect(boundary.selection).toEqual(extended.selection);

    expect(resolveSelectionCursor(EMPTY_SELECTION, "first", initial, { scope: "items" })).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "items",
    });
    expect(resolveSelectionCursor(EMPTY_SELECTION, "first", initial, { scope: "/missing" })).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });

  test("cursor helpers accept explicit visible JSONPoint order", () => {
    const ordered = moveSelectionCursor(
      EMPTY_SELECTION,
      "first",
      "single",
      initial,
      { points: ["/items/2", "/items/0"] },
    );
    expect(ordered).toMatchObject({ ok: true, pointer: "/items/2" });
    if (!ordered.ok) throw new Error(ordered.reason);

    const next = moveSelectionCursor(ordered.selection, "next", "single", initial, {
      points: ["/items/2", "/items/0"],
    });
    expect(next).toMatchObject({ ok: true, pointer: "/items/0", previousPointer: "/items/2" });
    if (!next.ok) throw new Error(next.reason);

    const textPoints = [
      { path: "/items/0/name" as const, offset: 0 },
      { path: "/items/0/name" as const, offset: 1 },
      { path: "/items/1/name" as const, offset: 0 },
    ];
    const textNext = moveSelectionCursor(next.selection, "first", "single", initial, { points: textPoints });
    expect(textNext).toMatchObject({
      ok: true,
      pointer: "/items/0/name",
      point: { path: "/items/0/name", offset: 0 },
    });
    if (!textNext.ok) throw new Error(textNext.reason);

    const textExtended = extendSelectionCursor(textNext.selection, "next", "extended", initial, { points: textPoints });
    expect(textExtended).toMatchObject({
      ok: true,
      pointer: "/items/0/name",
      point: { path: "/items/0/name", offset: 1 },
    });
    if (!textExtended.ok) throw new Error(textExtended.reason);
    expect(textExtended.selection.selectionRanges).toEqual([{
      anchor: { path: "/items/0/name", offset: 0 },
      focus: { path: "/items/0/name", offset: 1 },
    }]);

    expect(resolveSelectionCursor(EMPTY_SELECTION, "first", initial, { points: ["items"] })).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "items",
    });
  });

  test("cursor helpers accept JSONPath query order", () => {
    const first = moveSelectionCursor(
      EMPTY_SELECTION,
      "first",
      "single",
      initial,
      { query: "$.items[*].name" },
    );
    expect(first).toMatchObject({ ok: true, pointer: "/items/0/name" });
    if (!first.ok) throw new Error(first.reason);

    const next = moveSelectionCursor(first.selection, "next", "single", initial, {
      query: "$.items[*].name",
    });
    expect(next).toMatchObject({
      ok: true,
      pointer: "/items/1/name",
      previousPointer: "/items/0/name",
    });

    expect(resolveSelectionCursor(EMPTY_SELECTION, "first", initial, { query: "$.items[" })).toMatchObject({
      ok: false,
      code: "syntax_error",
      pointer: null,
    });
    expect(resolveSelectionCursor(EMPTY_SELECTION, "first", initial, { query: "$.missing[*]" })).toMatchObject({
      ok: false,
      code: "empty_scope",
      reason: "cursor query matched no points: $.missing[*]",
      pointer: null,
    });
  });

  test("orders selection ranges by JSON source, query, or visible point order", () => {
    expect(compareSelectionPoints(
      { path: "/items/0/name", offset: 1 },
      { path: "/items/0/name", offset: 0 },
      initial,
    )).toMatchObject({
      ok: true,
      order: 1,
      direction: "backward",
      leftPointer: "/items/0/name",
      rightPointer: "/items/0/name",
    });

    expect(compareSelectionPoints(
      { path: "/items/1/name", offset: 2 },
      { path: "/items/0/name", offset: 1 },
      initial,
    )).toMatchObject({
      ok: true,
      order: 1,
      direction: "backward",
      leftPointer: "/items/1/name",
      rightPointer: "/items/0/name",
    });

    expect(compareSelectionPoints(
      { path: "/items/0", edge: "after" },
      "/items/0/name",
      initial,
    )).toMatchObject({
      ok: true,
      order: 1,
      direction: "backward",
    });

    const ordered = orderSelectionRange(
      {
        anchor: { path: "/items/1/name", offset: 1 },
        focus: { path: "/items/0/name", offset: 0 },
      },
      initial,
      { query: "$.items[*].name" },
    );
    expect(ordered).toMatchObject({
      ok: true,
      range: {
        direction: "backward",
        collapsed: false,
        start: { path: "/items/0/name", offset: 0 },
        end: { path: "/items/1/name", offset: 1 },
      },
    });

    expect(orderSelectionRange(
      { anchor: "/items/2", focus: "/items/0" },
      initial,
      { points: ["/items/0", "/items/1"] },
    )).toMatchObject({
      ok: false,
      code: "point_not_in_order",
      pointer: "/items/2",
    });

    expect(orderPrimarySelectionRange(EMPTY_SELECTION, initial)).toMatchObject({
      ok: false,
      code: "empty_selection",
    });
  });

  test("selection state exposes ordered primary range for selection editing", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, { mode: "extended" });

    selection.setBaseAndExtent(
      { path: "/items/1/name", offset: 1 },
      { path: "/items/0/name", offset: 0 },
    );

    expect(selection.orderPrimaryRange({ query: "$.items[*].name" })).toMatchObject({
      ok: true,
      range: {
        direction: "backward",
        start: { path: "/items/0/name", offset: 0 },
        end: { path: "/items/1/name", offset: 1 },
      },
    });
  });

  test("orders all selection ranges by document order while preserving original indexes", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: [
        { anchor: "/items/2/name", focus: "/items/1/name" },
        { anchor: { path: "/items/0/name", offset: 1 }, focus: { path: "/items/0/name", offset: 0 } },
        "/items/1/id",
      ],
    });

    const ordered = orderSelectionRanges(selection.snapshot(), initial);
    expect(ordered).toMatchObject({
      ok: true,
      primaryIndex: 1,
      ranges: [
        {
          index: 1,
          primary: false,
          direction: "backward",
          start: { path: "/items/0/name", offset: 0 },
          end: { path: "/items/0/name", offset: 1 },
        },
        {
          index: 2,
          primary: true,
          start: "/items/1/id",
          end: "/items/1/id",
        },
        {
          index: 0,
          primary: false,
          direction: "backward",
          start: "/items/1/name",
          end: "/items/2/name",
        },
      ],
      primaryRange: {
        index: 2,
        primary: true,
        start: "/items/1/id",
      },
    });

    const visible = selection.orderRanges({
      points: [
        { path: "/items/0/name", offset: 0 },
        { path: "/items/0/name", offset: 1 },
        "/items/1/id",
        "/items/1/name",
        "/items/2/name",
      ],
    });
    expect(visible).toMatchObject({
      ok: true,
      ranges: [
        { index: 1, start: { path: "/items/0/name", offset: 0 } },
        { index: 2, start: "/items/1/id" },
        { index: 0, start: "/items/1/name" },
      ],
    });

    expect(orderSelectionRanges(EMPTY_SELECTION, initial)).toMatchObject({
      ok: false,
      code: "empty_selection",
      index: null,
    });
  });

  test("projects selection ranges into pointer-local spans for rendering", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "extended",
      initial: [{
        anchor: { path: "/items/0/name", offset: 0 },
        focus: { path: "/items/2/name", offset: 1 },
      }],
    });

    expect(selectionSpansForPointer(
      selection.snapshot(),
      "/items/1/name",
      initial,
      { query: "$.items[*].name" },
    )).toMatchObject({
      ok: true,
      pointer: "/items/1/name",
      spans: [{
        rangeIndex: 0,
        primary: true,
        start: { path: "/items/1/name", edge: "before" },
        end: { path: "/items/1/name", edge: "after" },
        startOffset: 0,
        endOffset: 1,
        collapsed: false,
        full: true,
      }],
    });

    expect(selection.spansForPointer("/items/2/name", { query: "$.items[*].name" })).toMatchObject({
      ok: true,
      spans: [{
        startOffset: 0,
        endOffset: 1,
        full: true,
      }],
    });

    expect(selection.spansForPointer("/items/0/id", { query: "$.items[*].name" })).toEqual({
      ok: true,
      pointer: "/items/0/id",
      spans: [],
    });

    expect(selectionSpansForPointer(EMPTY_SELECTION, "/items/0/name", initial)).toEqual({
      ok: true,
      pointer: "/items/0/name",
      spans: [],
    });
  });

  test("selection spans accept app-provided lengths for non-string offset domains", () => {
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

  test("plans text edits from selection ranges and preserves selection context", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "extended",
      context: { marks: ["bold"] },
      initial: [{
        anchor: { path: "/items/0/name", offset: 0 },
        focus: { path: "/items/0/name", offset: 1 },
      }],
    });

    expect(selectionTextEdits(selection.snapshot(), initial, "AX")).toMatchObject({
      ok: true,
      edits: [{
        pointer: "/items/0/name",
        rangeIndex: 0,
        primary: true,
        startOffset: 0,
        endOffset: 1,
        replacement: "AX",
      }],
    });

    expect(replaceSelectionText(selection.snapshot(), initial, "AX")).toEqual({
      ok: true,
      patch: [{ op: "replace", path: "/items/0/name", value: "AX" }],
      pointers: ["/items/0/name"],
      edits: [{
        pointer: "/items/0/name",
        rangeIndex: 0,
        primary: true,
        start: { path: "/items/0/name", offset: 0 },
        end: { path: "/items/0/name", offset: 1 },
        startOffset: 0,
        endOffset: 1,
        collapsed: false,
        full: true,
        replacement: "AX",
      }],
      selection: {
        ranges: ["/items/0/name"],
        selectedPointers: ["/items/0/name"],
        selectionRanges: [{
          anchor: { path: "/items/0/name", offset: 2 },
          focus: { path: "/items/0/name", offset: 2 },
        }],
        primaryIndex: 0,
        anchor: { path: "/items/0/name", offset: 2 },
        focus: { path: "/items/0/name", offset: 2 },
        context: { marks: ["bold"] },
      },
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

    const result = selection.textPatch("!");

    expect(result).toMatchObject({
      ok: true,
      patch: [
        { op: "replace", path: "/items/0/name", value: "A!" },
        { op: "replace", path: "/items/1/name", value: "B!" },
      ],
      pointers: ["/items/0/name", "/items/1/name"],
      selection: {
        selectedPointers: ["/items/0/name", "/items/1/name"],
        selectionRanges: [
          {
            anchor: { path: "/items/0/name", offset: 2 },
            focus: { path: "/items/0/name", offset: 2 },
          },
          {
            anchor: { path: "/items/1/name", offset: 2 },
            focus: { path: "/items/1/name", offset: 2 },
          },
        ],
        primaryIndex: 0,
        focus: { path: "/items/0/name", offset: 2 },
      },
    });
  });

  test("deletes text backward or forward from collapsed carets", () => {
    const state = { title: "ABCD" };
    const selection = {
      ...EMPTY_SELECTION,
      ranges: ["/title"],
      selectedPointers: ["/title"],
      selectionRanges: [{
        anchor: { path: "/title", offset: 2 },
        focus: { path: "/title", offset: 2 },
      }],
      primaryIndex: 0,
      anchor: { path: "/title", offset: 2 },
      focus: { path: "/title", offset: 2 },
    };

    expect(deleteSelectionText(selection, state)).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/title", value: "ACD" }],
      selection: {
        focus: { path: "/title", offset: 1 },
      },
    });

    expect(deleteSelectionText(selection, state, { direction: "forward", count: 2 })).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/title", value: "AB" }],
      selection: {
        focus: { path: "/title", offset: 2 },
      },
    });

    expect(deleteSelectionText({
      ...selection,
      selectionRanges: [{
        anchor: { path: "/title", offset: 0 },
        focus: { path: "/title", offset: 0 },
      }],
      anchor: { path: "/title", offset: 0 },
      focus: { path: "/title", offset: 0 },
    }, state)).toMatchObject({
      ok: false,
      code: "cursor_boundary",
      pointer: "/title",
      index: 0,
    });
  });

  test("text edit planning supports app-provided non-string text domains", () => {
    const blockState = {
      blocks: [
        { text: "Alpha" },
        { text: "Beta" },
      ],
    };
    const selection = {
      ...EMPTY_SELECTION,
      ranges: ["/blocks/0", "/blocks/1"],
      selectedPointers: ["/blocks/0", "/blocks/1"],
      selectionRanges: [{
        anchor: { path: "/blocks/0", offset: 2 },
        focus: { path: "/blocks/1", offset: 3 },
      }],
      primaryIndex: 0,
      anchor: { path: "/blocks/0", offset: 2 },
      focus: { path: "/blocks/1", offset: 3 },
    };

    expect(selectionTextEdits(selection, blockState, "", {
      points: ["/blocks/0", "/blocks/1"],
      getLength(_pointer, value) {
        return typeof value === "object" && value !== null && "text" in value
          ? String((value as { text: unknown }).text).length
          : null;
      },
    })).toMatchObject({
      ok: true,
      edits: [
        {
          pointer: "/blocks/0",
          startOffset: 2,
          endOffset: 5,
          full: false,
        },
        {
          pointer: "/blocks/1",
          startOffset: 0,
          endOffset: 3,
          full: false,
        },
      ],
    });

    expect(replaceSelectionText(selection, blockState, "", {
      points: ["/blocks/0", "/blocks/1"],
      getLength(_pointer, value) {
        return typeof value === "object" && value !== null && "text" in value
          ? String((value as { text: unknown }).text).length
          : null;
      },
    })).toMatchObject({
      ok: false,
      code: "multi_pointer_range",
      pointer: "/blocks/0",
      index: 0,
    });
  });

  test("text replacement reports missing length and non-string targets", () => {
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
        anchor: { path: "/items/0", offset: 0 },
        focus: { path: "/items/0", offset: 0 },
      }],
    });

    expect(pointSelection.textPatch("x", { points: ["/items/0"] })).toMatchObject({
      ok: false,
      code: "not_string",
      pointer: "/items/0",
      index: 0,
    });
  });

  test("selects a headless scope or explicit visible point set", () => {
    const scoped = selectSelectionScope(
      EMPTY_SELECTION,
      "multiple",
      initial,
      { scope: "/items", includeScope: false },
    );
    expect(scoped).toMatchObject({ ok: true });
    if (!scoped.ok) throw new Error(scoped.reason);
    expect(scoped.points).toEqual([
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
    expect(scoped.selection.selectedPointers).toEqual(scoped.points);
    expect(primaryPointer(scoped.selection)).toBe("/items/2/name");

    const visible = selectSelectionScope(
      EMPTY_SELECTION,
      "multiple",
      initial,
      { points: ["/items/2", "/items/0"], primaryIndex: 0 },
    );
    expect(visible).toMatchObject({ ok: true });
    if (!visible.ok) throw new Error(visible.reason);
    expect(visible.selection.selectedPointers).toEqual(["/items/2", "/items/0"]);
    expect(primaryPointer(visible.selection)).toBe("/items/2");

    const found = selectSelectionScope(
      EMPTY_SELECTION,
      "multiple",
      initial,
      { query: "$.items[*].id" },
    );
    expect(found).toMatchObject({ ok: true, points: ["/items/0/id", "/items/1/id", "/items/2/id"] });
    if (!found.ok) throw new Error(found.reason);
    expect(found.selection.selectedPointers).toEqual(["/items/0/id", "/items/1/id", "/items/2/id"]);

    expect(resolveSelectionScope(initial, { query: "$.items[" })).toMatchObject({
      ok: false,
      code: "syntax_error",
      pointer: null,
    });
    expect(resolveSelectionScope(initial, { query: "$.missing[*]" })).toMatchObject({
      ok: false,
      code: "empty_scope",
      reason: "selection query matched no points: $.missing[*]",
      pointer: null,
    });

    expect(resolveSelectionScope(initial, { points: [] })).toMatchObject({
      ok: false,
      code: "empty_scope",
      pointer: "",
    });

    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, { mode: "multiple" });
    expect(selection.selectScope({ points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: true,
      points: ["/items/1", "/items/0"],
    });
    expect(selection.selectedPointers).toEqual(["/items/1", "/items/0"]);
    expect(selection.resolveScope({ points: ["/items/2"] })).toEqual({
      ok: true,
      points: ["/items/2"],
    });
  });

  test("provides headless multi-selection and caret tracking over JSON ops", () => {
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
