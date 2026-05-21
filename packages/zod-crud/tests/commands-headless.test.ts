import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createCan } from "../src/commands/buildCan.js";
import { createCommands } from "../src/commands/buildCommands.js";
import { createCheck } from "../src/check.js";
import { createJSONDocument, createSelection } from "../src/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

describe("headless command/check/can factories", () => {
  test("createCommands composes selection-aware edit verbs outside document facade", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: false,
    });
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: ["/items/0/name"],
    });
    const selectionRef = { current: selection };
    const history = historyControls(doc);
    const commands = createCommands({ schema: Schema, ops: doc.ops, history, selectionRef, selectionMode: "multiple" });
    const check = createCheck({ schema: Schema, ops: doc.ops, history, selectionRef });
    const can = createCan({ schema: Schema, ops: doc.ops, history, selectionRef, check });

    expect(check.replace("A1")).toEqual({ ok: true });
    expect(can.replace("A1")).toBe(true);

    const replaced = commands.replace("A1");

    expect(replaced).toEqual({ ok: true });
    expect(doc.value.items[0]?.name).toBe("A1");
    expect(doc.history.undoDepth).toBe(1);

    selection.setBaseAndExtent(
      { path: "/items/0/name", offset: 1 },
      { path: "/items/0/name", offset: 2 },
    );
    expect(check.replaceText("X")).toEqual({ ok: true });
    expect(can.replaceText("X")).toBe(true);

    const textReplaced = commands.replaceText("X");

    expect(textReplaced).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/items/0/name", value: "AX" }],
      selection: {
        focus: { path: "/items/0/name", offset: 2 },
      },
    });
    expect(doc.value.items[0]?.name).toBe("AX");
    expect(selection.caret).toEqual({ path: "/items/0/name", offset: 2 });
    expect(doc.history.undoDepth).toBe(2);

    expect(check.deleteText()).toEqual({ ok: true });
    expect(can.deleteText()).toBe(true);

    const textDeleted = commands.deleteText();

    expect(textDeleted).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/items/0/name", value: "A" }],
      selection: {
        focus: { path: "/items/0/name", offset: 1 },
      },
    });
    expect(doc.value.items[0]?.name).toBe("A");
    expect(selection.caret).toEqual({ path: "/items/0/name", offset: 1 });
    expect(doc.history.undoDepth).toBe(3);

    commands.select({ type: "collapse", pointer: "/items/1" });
    const copied = commands.copy();

    expect(selection.primaryPointer).toBe("/items/1");
    expect(copied).toEqual({
      ok: true,
      payload: { id: "b", name: "B" },
      source: "/items/1",
      sources: ["/items/1"],
    });

    expect(check.replace("$.items[*].name", "renamed")).toEqual({ ok: true });
    expect(can.replace("$.items[*].name", "renamed")).toBe(true);
    const queryReplaced = commands.replace("$.items[*].name", "renamed");
    expect(queryReplaced).toMatchObject({
      ok: true,
      pointers: ["/items/0/name", "/items/1/name"],
    });
    expect(doc.value.items.map((item) => item.name)).toEqual(["renamed", "renamed"]);
    expect(doc.history.undoDepth).toBe(4);

    const selected = commands.selectScope({ points: ["/items/1", "/items/0"] });
    expect(selected).toMatchObject({ ok: true, points: ["/items/1", "/items/0"] });
    expect(selection.selectedPointers).toEqual(["/items/1", "/items/0"]);
    expect(selection.primaryPointer).toBe("/items/0");

    expect(commands.moveCursor("first", { points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: true,
      pointer: "/items/1",
    });
    expect(selection.caretPointer).toBe("/items/1");

    expect(commands.extendCursor("next", { points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: true,
      pointer: "/items/0",
    });
    expect(selection.selectionRanges).toEqual([{ anchor: "/items/1", focus: "/items/0" }]);

    expect(check.moveCursor("next", { points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: false,
      code: "cursor_boundary",
    });
    expect(can.moveCursor("next", { points: ["/items/1", "/items/0"] })).toBe(false);
    expect(check.selectScope({ points: ["/items/1"] })).toEqual({ ok: true });
    expect(can.selectScope({ points: ["/items/1"] })).toBe(true);

    const querySelected = commands.selectScope({ query: "$.items[*].name" });
    expect(querySelected).toMatchObject({ ok: true, points: ["/items/0/name", "/items/1/name"] });
    expect(selection.selectedPointers).toEqual(["/items/0/name", "/items/1/name"]);

    expect(commands.moveCursor("first", { query: "$.items[*].id" })).toMatchObject({
      ok: true,
      pointer: "/items/0/id",
    });
    expect(commands.moveCursor("next", { query: "$.items[*].id" })).toMatchObject({
      ok: true,
      pointer: "/items/1/id",
    });
    expect(check.selectScope({ query: "$.items[*].id" })).toEqual({ ok: true });
    expect(can.selectScope({ query: "$.items[*].id" })).toBe(true);
    expect(check.moveCursor("next", { query: "$.items[*].id" })).toMatchObject({
      ok: false,
      code: "cursor_boundary",
    });
    expect(can.moveCursor("next", { query: "$.items[*].id" })).toBe(false);
    expect(check.selectScope({ query: "$.items[" })).toMatchObject({
      ok: false,
      code: "syntax_error",
    });
    expect(can.selectScope({ query: "$.items[" })).toBe(false);
  });

  test("createCommands can be used without a selection ref when callers pass explicit pointers", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const commands = createCommands({ schema: Schema, ops: doc.ops, history: historyControls(doc) });

    expect(commands.copy()).toEqual({
      ok: false,
      code: "empty_selection",
      message: "copy source selection is empty",
    });

    const moved = commands.move("/items/0", "/items/1");

    expect(moved.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

function historyControls(doc: {
  commands: { undo(): boolean; redo(): boolean };
  history: { readonly canUndo: boolean; readonly canRedo: boolean };
}) {
  return {
    undo: () => doc.commands.undo(),
    redo: () => doc.commands.redo(),
    canUndo: () => doc.history.canUndo,
    canRedo: () => doc.history.canRedo,
  };
}
