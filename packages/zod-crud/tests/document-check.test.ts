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

describe("doc.check — explainable dry-run guard", () => {
  test("matches doc.can for verb guards", () => {
    const doc = createJSONDocument(Schema, initial);
    const invalidReplace = doc.check.replace("/items/0/name", 1);
    const missingCopy = doc.check.copy("/items/99");
    const invalidPointer = doc.check.patch([{ op: "replace", path: "items/0/name", value: "X" }]);

    expect(invalidReplace).toMatchObject({ ok: false, code: "schema_violation" });
    expect(invalidReplace.ok).toBe(doc.can.replace("/items/0/name", 1));
    expect(missingCopy).toMatchObject({ ok: false, code: "path_not_found" });
    expect(missingCopy.ok).toBe(doc.can.copy("/items/99"));
    expect(invalidPointer).toMatchObject({ ok: false, code: "invalid_pointer" });
  });

  test("reports cross-field refinement failures without mutation", () => {
    const RangeSchema = z.object({
      start: z.number(),
      end: z.number(),
    }).superRefine((value, ctx) => {
      if (value.end <= value.start) {
        ctx.addIssue({
          code: "custom",
          path: ["end"],
          message: "end must be greater than start",
        });
      }
    });
    const doc = createJSONDocument(RangeSchema, { start: 1, end: 3 });

    const result = doc.check.replace("/start", 5);

    expect(result).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/end", message: "end must be greater than start" }],
    });
    expect(result.ok).toBe(doc.can.replace("/start", 5));
    expect(doc.value).toEqual({ start: 1, end: 3 });
  });

  test("does not mutate value, selection, clipboard, or history", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/1"] },
    });
    doc.clipboard.write({ id: "x", name: "X" }, { source: "/items/1" });

    const checked = doc.check.cut("/items/0");

    expect(checked.ok).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.selection?.focus).toBe("/items/1");
    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "x", name: "X" },
      source: "/items/1",
      sources: ["/items/1"],
    });
    expect(doc.history.undoDepth).toBe(0);
    expect(doc.history.redoDepth).toBe(0);
  });

  test("copy and cut checks default to current selection without mutation", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.check.copy()).toEqual({ ok: true });
    expect(doc.can.copy()).toBe(true);
    expect(doc.check.cut()).toEqual({ ok: true });
    expect(doc.can.cut()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.selection?.selectedSource).toBe("/items/0");

    doc.selection?.empty();

    expect(doc.check.copy()).toMatchObject({ ok: false, code: "empty_selection" });
    expect(doc.can.copy()).toBe(false);
  });

  test("duplicate checks default to current primary selection without mutation", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.check.duplicate()).toEqual({ ok: true });
    expect(doc.can.duplicate()).toBe(true);
    expect(doc.value).toEqual(initial);

    doc.selection?.empty();

    expect(doc.check.duplicate()).toMatchObject({
      ok: false,
      code: "empty_selection",
      reason: "duplicate source selection is empty",
    });
    expect(doc.can.duplicate()).toBe(false);
  });

  test("paste checks default to current selection target without mutation", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.check.paste({ id: "x", name: "X" }, "after")).toEqual({ ok: true });
    expect(doc.can.paste({ id: "x", name: "X" }, "after")).toBe(true);
    expect(doc.value).toEqual(initial);

    doc.selection?.empty();

    expect(doc.check.paste({ id: "x", name: "X" })).toMatchObject({
      ok: false,
      code: "empty_selection",
      reason: "paste target selection is empty",
    });
    expect(doc.can.paste({ id: "x", name: "X" })).toBe(false);
  });

  test("replace checks default to current selection target without mutation", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single", initial: ["/items/0/name"] },
    });

    expect(doc.check.replace("A1")).toEqual({ ok: true });
    expect(doc.can.replace("A1")).toBe(true);
    expect(doc.value).toEqual(initial);

    doc.selection?.empty();

    expect(doc.check.replace("A1")).toMatchObject({
      ok: false,
      code: "empty_selection",
      reason: "replace target selection is empty",
    });
    expect(doc.can.replace("A1")).toBe(false);
  });

  test("reports discriminated union paste mismatch before mutation", () => {
    const BlockSchema = z.object({
      blocks: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text"), text: z.string() }),
        z.object({ kind: z.literal("image"), src: z.string() }),
      ])),
    });
    const doc = createJSONDocument(BlockSchema, {
      blocks: [{ kind: "text", text: "hello" }],
    });

    const result = doc.check.paste({ kind: "video", src: "v.mp4" }, "/blocks/0", "replace");

    expect(result).toMatchObject({ ok: false, code: "du_branch_mismatch" });
    expect(result.ok).toBe(doc.can.paste({ kind: "video", src: "v.mp4" }, "/blocks/0", "replace"));
    expect(doc.value.blocks).toEqual([{ kind: "text", text: "hello" }]);
  });

  test("explains unavailable undo and redo stacks", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.check.undo).toEqual({ ok: false, code: "empty_stack", reason: "undo stack is empty" });
    expect(doc.check.redo).toEqual({ ok: false, code: "empty_stack", reason: "redo stack is empty" });
    expect(doc.can.undo).toBe(false);
    expect(doc.can.redo).toBe(false);

    doc.commands.replace("/items/0/name", "A1");

    expect(doc.check.undo).toEqual({ ok: true });
    expect(doc.can.undo).toBe(true);
  });
});
