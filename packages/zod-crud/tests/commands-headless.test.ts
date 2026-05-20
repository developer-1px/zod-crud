import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  createCan,
  createCheck,
  createCommands,
  createJSONDocument,
  createSelection,
} from "../src/index.js";

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
      mode: "single",
      initial: ["/items/0/name"],
    });
    const selectionRef = { current: selection };
    const commands = createCommands({ schema: Schema, ops: doc.ops, selectionRef });
    const check = createCheck({ schema: Schema, ops: doc.ops, selectionRef });
    const can = createCan({ schema: Schema, ops: doc.ops, selectionRef, check });

    expect(check.replace("A1")).toEqual({ ok: true });
    expect(can.replace("A1")).toBe(true);

    const replaced = commands.replace("A1");

    expect(replaced).toEqual({ ok: true });
    expect(doc.value.items[0]?.name).toBe("A1");
    expect(doc.history.undoDepth).toBe(1);

    commands.select({ type: "collapse", pointer: "/items/1" });
    const copied = commands.copy();

    expect(selection.primaryPointer).toBe("/items/1");
    expect(copied).toEqual({
      ok: true,
      payload: { id: "b", name: "B" },
      source: "/items/1",
      sources: ["/items/1"],
    });
  });

  test("createCommands can be used without a selection ref when callers pass explicit pointers", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const commands = createCommands({ schema: Schema, ops: doc.ops });

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
