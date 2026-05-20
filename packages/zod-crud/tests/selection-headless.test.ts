import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  EMPTY_SELECTION,
  createJSONDocument,
  createSelection,
  extendSelectionCursor,
  moveSelectionCursor,
  primaryPointer,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectSelectionScope,
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
});
