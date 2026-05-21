import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createClipboard, createJSONDocument, createSelection } from "../src/index.js";
import type { JSONPatchOperation } from "../src/index.js";

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

const EditorSchema = z.object({
  doc: z.object({
    blocks: z.array(z.object({ id: z.string(), text: z.string() })),
  }),
});

const editorInitial: z.output<typeof EditorSchema> = {
  doc: {
    blocks: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
    ],
  },
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
    expect("undo" in doc.ops).toBe(false);
    expect("redo" in doc.ops).toBe(false);
    expect("canUndo" in doc.ops).toBe(false);
    expect("canRedo" in doc.ops).toBe(false);

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

  test("commands paste defaults to the current selection target", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    const pasted = doc.commands.paste({ id: "x", name: "X" }, "after");

    expect(pasted.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "x", "b"]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands paste reports empty selection when target is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    const pasted = doc.commands.paste({ id: "x", name: "X" });

    expect(pasted).toEqual({
      ok: false,
      code: "empty_selection",
      message: "paste target selection is empty",
    });
    expect(doc.value).toEqual(initial);
  });

  test("commands replace defaults to the current selection target", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0/name"] },
    });

    const replaced = doc.commands.replace("A1");

    expect(replaced.ok).toBe(true);
    expect(doc.value.items[0]?.name).toBe("A1");
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands replaceText commits string selection edits with final caret", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/items/0/name", offset: 0 },
          focus: { path: "/items/0/name", offset: 1 },
        }],
        context: { marks: ["bold"] },
      },
    });

    expect(doc.check.replaceText("AX")).toEqual({ ok: true });
    expect(doc.can.replaceText("AX")).toBe(true);

    const replaced = doc.commands.replaceText("AX");

    expect(replaced).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/items/0/name", value: "AX" }],
      selection: {
        focus: { path: "/items/0/name", offset: 2 },
        context: { marks: ["bold"] },
      },
    });
    expect(doc.value.items[0]?.name).toBe("AX");
    expect(doc.selection?.caret).toEqual({ path: "/items/0/name", offset: 2 });
    expect(doc.selection?.context).toEqual({ marks: ["bold"] });
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value.items[0]?.name).toBe("A");
    expect(doc.selection?.selectionRanges).toEqual([{
      anchor: { path: "/items/0/name", offset: 0 },
      focus: { path: "/items/0/name", offset: 1 },
    }]);
    expect(doc.selection?.context).toEqual({ marks: ["bold"] });
  });

  test("commands replaceText reports selection planning failures without mutation", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/items/0/name", offset: 0 },
          focus: { path: "/items/1/name", offset: 1 },
        }],
      },
    });

    expect(doc.commands.replaceText("X")).toMatchObject({
      ok: false,
      code: "multi_pointer_range",
      pointer: "/items/0/name",
    });
    expect(doc.check.replaceText("X")).toMatchObject({
      ok: false,
      code: "multi_pointer_range",
      pointer: "/items/0/name",
    });
    expect(doc.can.replaceText("X")).toBe(false);
    expect(doc.value).toEqual(initial);
  });

  test("commands deleteText commits caret deletion and restores through undo", () => {
    const doc = createJSONDocument(EditorSchema, editorInitial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/doc/blocks/0/text", offset: 2 },
          focus: { path: "/doc/blocks/0/text", offset: 2 },
        }],
        context: { input: "keyboard" },
      },
    });

    expect(doc.check.deleteText()).toEqual({ ok: true });
    expect(doc.can.deleteText()).toBe(true);

    const deleted = doc.commands.deleteText();

    expect(deleted).toMatchObject({
      ok: true,
      patch: [{ op: "replace", path: "/doc/blocks/0/text", value: "Apha" }],
      selection: {
        focus: { path: "/doc/blocks/0/text", offset: 1 },
        context: { input: "keyboard" },
      },
    });
    expect(doc.value.doc.blocks[0]?.text).toBe("Apha");
    expect(doc.selection?.caret).toEqual({ path: "/doc/blocks/0/text", offset: 1 });
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value).toEqual(editorInitial);
    expect(doc.selection?.caret).toEqual({ path: "/doc/blocks/0/text", offset: 2 });
    expect(doc.selection?.context).toEqual({ input: "keyboard" });
  });

  test("commands deleteText reports caret boundary failures without mutation", () => {
    const doc = createJSONDocument(EditorSchema, editorInitial, {
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/doc/blocks/0/text", offset: 0 },
          focus: { path: "/doc/blocks/0/text", offset: 0 },
        }],
      },
    });

    expect(doc.commands.deleteText()).toMatchObject({
      ok: false,
      code: "cursor_boundary",
      pointer: "/doc/blocks/0/text",
    });
    expect(doc.check.deleteText()).toMatchObject({
      ok: false,
      code: "cursor_boundary",
      pointer: "/doc/blocks/0/text",
    });
    expect(doc.can.deleteText()).toBe(false);
    expect(doc.value).toEqual(editorInitial);
  });

  test("commands replace accepts JSONPath multi-match and commits one history entry", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    const replaced = doc.commands.replace("$.items[*].name", "renamed");

    expect(replaced).toMatchObject({
      ok: true,
      pointers: ["/items/0/name", "/items/1/name"],
    });
    expect(doc.value.items.map((item) => item.name)).toEqual(["renamed", "renamed"]);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
  });

  test("commit applies patch and final selection as one history entry", () => {
    const doc = createJSONDocument(EditorSchema, editorInitial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [
          { path: "/doc/blocks/0", offset: 1 },
          { path: "/doc/blocks/0", offset: 4 },
        ],
      },
    });
    const observed: Array<{ focus: unknown; context: unknown; selectionAfter: unknown }> = [];
    doc.ops.subscribe((_, metadata) => {
      observed.push({
        focus: doc.selection?.focus,
        context: doc.selection?.context,
        selectionAfter: metadata?.selectionAfter,
      });
    });

    const committed = doc.commit(
      [
        {
          op: "replace",
          path: "/doc/blocks",
          value: [
            { id: "a", text: "AXa" },
            { id: "b", text: "Beta" },
          ],
        },
      ],
      {
        label: "insertText",
        origin: "editor",
        selection: {
          type: "setBaseAndExtent",
          anchor: { path: "/doc/blocks/0", offset: 2 },
          focus: { path: "/doc/blocks/0", offset: 2 },
          context: { marks: ["bold"] },
        },
      },
    );

    expect(committed).toEqual({ ok: true });
    expect(doc.value.doc.blocks[0]?.text).toBe("AXa");
    expect(doc.lastPatch).toEqual([
      {
        op: "replace",
        path: "/doc/blocks",
        value: [
          { id: "a", text: "AXa" },
          { id: "b", text: "Beta" },
        ],
      },
    ]);
    expect(doc.selection?.focus).toEqual({ path: "/doc/blocks/0", offset: 2 });
    expect(doc.selection?.context).toEqual({ marks: ["bold"] });
    expect(observed).toEqual([
      {
        focus: { path: "/doc/blocks/0", offset: 2 },
        context: { marks: ["bold"] },
        selectionAfter: {
          selectedPointers: ["/doc/blocks/0"],
          selectionRanges: [{
            anchor: { path: "/doc/blocks/0", offset: 2 },
            focus: { path: "/doc/blocks/0", offset: 2 },
          }],
          primaryIndex: 0,
          anchor: { path: "/doc/blocks/0", offset: 2 },
          focus: { path: "/doc/blocks/0", offset: 2 },
          context: { marks: ["bold"] },
        },
      },
    ]);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value).toEqual(editorInitial);
    expect(doc.selection?.anchor).toEqual({ path: "/doc/blocks/0", offset: 1 });
    expect(doc.selection?.focus).toEqual({ path: "/doc/blocks/0", offset: 4 });
    expect(doc.selection?.context).toBeUndefined();

    expect(doc.commands.redo()).toBe(true);
    expect(doc.value.doc.blocks[0]?.text).toBe("AXa");
    expect(doc.lastPatch).toEqual([
      {
        op: "replace",
        path: "/doc/blocks",
        value: [
          { id: "a", text: "AXa" },
          { id: "b", text: "Beta" },
        ],
      },
    ]);
    expect(doc.selection?.focus).toEqual({ path: "/doc/blocks/0", offset: 2 });
    expect(doc.selection?.context).toEqual({ marks: ["bold"] });
  });

  test("commit selection-only updates do not create document patches or history", () => {
    const doc = createJSONDocument(EditorSchema, editorInitial, {
      history: 10,
      selection: { mode: "extended" },
    });
    const patches: unknown[] = [];
    doc.ops.subscribe((patch) => patches.push(patch));

    const committed = doc.commit([], {
      selection: {
        type: "setBaseAndExtent",
        anchor: { path: "/doc/blocks/0", offset: 1 },
        focus: { path: "/doc/blocks/0", offset: 3 },
        context: { marks: ["italic"] },
      },
    });

    expect(committed).toEqual({ ok: true });
    expect(doc.selection?.anchor).toEqual({ path: "/doc/blocks/0", offset: 1 });
    expect(doc.selection?.focus).toEqual({ path: "/doc/blocks/0", offset: 3 });
    expect(doc.selection?.context).toEqual({ marks: ["italic"] });
    expect(patches).toEqual([]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("lastPatch is a document snapshot and clears on empty patch commits", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.lastPatch).toEqual([]);

    const added = doc.ops.add("/items/-", { id: "c", name: "C" });
    expect(added).toEqual({ ok: true });
    expect(doc.lastPatch).toEqual([{ op: "add", path: "/items/2", value: { id: "c", name: "C" } }]);
    expect(doc.history.undoDepth).toBe(1);

    const snapshot = doc.lastPatch;
    (snapshot as JSONPatchOperation[]).push({ op: "remove", path: "/items/0" });
    expect(doc.lastPatch).toEqual([{ op: "add", path: "/items/2", value: { id: "c", name: "C" } }]);

    const selected = doc.commit([], { selection: { type: "collapse", pointer: "/items/1" } });
    expect(selected).toEqual({ ok: true });
    expect(doc.lastPatch).toEqual([]);
    expect(doc.selection?.focus).toBe("/items/1");
    expect(doc.history.undoDepth).toBe(1);

    const emptyPatch = doc.ops.patch([]);
    expect(emptyPatch).toEqual({ ok: true });
    expect(doc.lastPatch).toEqual([]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands replace reports empty selection when target is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    const replaced = doc.commands.replace("A1");

    expect(replaced).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "replace target selection is empty",
    });
    expect(doc.value).toEqual(initial);
  });

  test("commands move defaults to the current primary selection source", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    const moved = doc.commands.move("/items/1");

    expect(moved.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands move reports empty selection when source is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    const moved = doc.commands.move("/items/1");

    expect(moved).toEqual({
      ok: false,
      code: "empty_selection",
      message: "move source selection is empty",
    });
    expect(doc.value).toEqual(initial);
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

  test("createClipboard composes independently with headless selection", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: false,
    });
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: ["/items/0", "/items/1"],
    });
    const clipboard = createClipboard({
      schema: Schema,
      getState: () => doc.value,
      ops: doc.ops,
      getSelectionSource: () => selection.selectedSource,
      getSelectionTarget: () => selection.primaryPointer,
    });

    const copied = clipboard.copy();

    expect(copied).toMatchObject({
      ok: true,
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });
    expect(clipboard.read()).toEqual({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });

    selection.collapse("/items/1");
    const pasted = clipboard.paste("after");

    expect(pasted.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "a", "b"]);
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

  test("doc.clipboard paste defaults to the current selection target", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    doc.clipboard.copy("/items/1");
    const pasted = doc.clipboard.paste("after");

    expect(pasted.ok).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "b"]);
    expect(doc.history.undoDepth).toBe(1);
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
    expect(doc.selection?.primaryRange).toEqual({ anchor: "/items/1", focus: "/items/1" });
    expect(doc.selection?.anchorPointer).toBe("/items/1");
    expect(doc.selection?.focusPointer).toBe("/items/1");
    expect(doc.selection?.selectedSource).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.primaryPointer).toBe("/items/1");
    expect(doc.selection?.caret).toBe(null);
    expect(doc.selection?.caretPointer).toBe(null);

    doc.commands.select({ type: "collapse", pointer: "/items/0", context: { tool: "pointer" } });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.selection?.context).toEqual({ tool: "pointer" });

    doc.commands.select({ type: "togglePointer", pointer: "/items/1" });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(doc.selection?.context).toEqual({ tool: "pointer" });

    doc.commands.select({ type: "clearContext" });
    expect(doc.selection?.context).toBeUndefined();
  });

  test("commands.selectScope mutates document selection from visible points or JSONPath query", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });

    const selected = doc.commands.selectScope({ points: ["/items/1", "/items/0"], primaryIndex: 0 });

    expect(selected).toMatchObject({ ok: true, points: ["/items/1", "/items/0"] });
    expect(doc.selection?.selectedPointers).toEqual(["/items/1", "/items/0"]);
    expect(doc.selection?.primaryPointer).toBe("/items/1");

    const found = doc.commands.selectScope({ query: "$.items[*].name" });

    expect(found).toMatchObject({ ok: true, points: ["/items/0/name", "/items/1/name"] });
    expect(doc.selection?.selectedPointers).toEqual(["/items/0/name", "/items/1/name"]);
    expect(doc.selection?.primaryPointer).toBe("/items/1/name");
  });

  test("commands move and extend cursor mutate document selection", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "extended", context: { mode: "keyboard" } },
    });

    expect(doc.commands.moveCursor("first", { points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: true,
      pointer: "/items/1",
    });
    expect(doc.selection?.caretPointer).toBe("/items/1");

    expect(doc.commands.extendCursor("next", { points: ["/items/1", "/items/0"] })).toMatchObject({
      ok: true,
      pointer: "/items/0",
    });
    expect(doc.selection?.selectionRanges).toEqual([{ anchor: "/items/1", focus: "/items/0" }]);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);

    expect(doc.commands.moveCursor("first", { query: "$.items[*].id" })).toMatchObject({
      ok: true,
      pointer: "/items/0/id",
    });
    expect(doc.commands.moveCursor("next", { query: "$.items[*].id" })).toMatchObject({
      ok: true,
      pointer: "/items/1/id",
    });
    expect(doc.selection?.context).toEqual({ mode: "keyboard" });
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

  test("selection initial accepts explicit JSONPoint ranges", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: {
        mode: "multiple",
        initial: [
          { anchor: "/items/0", focus: "/items/0" },
          {
            anchor: { path: "/items/1/name", offset: 99, affinity: "forward" },
            focus: { path: "/items/1/name", offset: 99, affinity: "forward" },
          },
        ],
      },
    });

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(doc.selection?.primaryIndex).toBe(1);
    expect(doc.selection?.primaryPointer).toBe("/items/1/name");
    expect(doc.selection?.caret).toBe(null);
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

  test("selection serializes to its snapshot", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    doc.selection?.collapse({ path: "/items/0/name", offset: 1, affinity: "forward" });

    expect(doc.selection?.toJSON()).toEqual(doc.selection?.snapshot());
    expect(JSON.parse(JSON.stringify(doc.selection))).toEqual(doc.selection?.snapshot());
  });

  test("selection restores serialized snapshots", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    });
    doc.selection?.selectRanges([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/1/name", offset: 99, affinity: "forward" },
        focus: { path: "/items/1/name", offset: 99, affinity: "forward" },
      },
    ]);
    const saved = JSON.parse(JSON.stringify(doc.selection));

    doc.selection?.empty();
    expect(doc.selection?.selectedPointers).toEqual([]);

    doc.selection?.restore(saved);

    expect(doc.selection?.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(doc.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(doc.selection?.primaryIndex).toBe(1);
    expect(doc.selection?.primaryPointer).toBe("/items/1/name");

    saved.selectionRanges[1].anchor.offset = 0;
    expect(doc.selection?.selectionRanges[1]?.anchor).toEqual({ path: "/items/1/name", offset: 1, affinity: "forward" });
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

  test("commands copy and cut default to the current selection source", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "multiple", initial: ["/items/0", "/items/1"] },
    });

    const copied = doc.commands.copy();
    expect(copied).toMatchObject({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });

    const cut = doc.commands.cut();
    expect(cut).toMatchObject({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });
    expect(doc.value.items).toEqual([]);
  });

  test("commands remove defaults to the current selection source without clipboard payload", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "multiple", initial: ["/items/0", "/items/1"] },
    });

    const removed = doc.commands.remove();

    expect(removed).toMatchObject({
      ok: true,
      sources: ["/items/0", "/items/1"],
    });
    expect("payload" in removed).toBe(false);
    expect(doc.value.items).toEqual([]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands copy and cut report empty selection when source is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single" },
    });

    expect(doc.commands.copy()).toEqual({
      ok: false,
      code: "empty_selection",
      message: "copy source selection is empty",
    });
    expect(doc.commands.cut()).toEqual({
      ok: false,
      code: "empty_selection",
      message: "cut source selection is empty",
    });
    expect(doc.commands.remove()).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "remove source selection is empty",
    });
    expect(doc.value).toEqual(initial);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("doc.clipboard copy and cut default to the current selection source", () => {
    const copyDoc = createJSONDocument(Schema, initial, {
      selection: { mode: "multiple", initial: ["/items/0", "/items/1"] },
    });

    const copied = copyDoc.clipboard.copy();
    expect(copied.ok).toBe(true);
    expect(copyDoc.clipboard.read()).toEqual({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });

    const cutDoc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });
    const cut = cutDoc.clipboard.cut();

    expect(cut.ok).toBe(true);
    expect(cutDoc.value.items).toEqual([{ id: "b", name: "B" }]);
    expect(cutDoc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
  });

  test("doc.clipboard copy and cut report empty selection when source is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single" },
    });

    expect(doc.clipboard.copy()).toEqual({
      ok: false,
      code: "empty_selection",
      message: "copy source selection is empty",
    });
    expect(doc.clipboard.cut()).toEqual({
      ok: false,
      code: "empty_selection",
      message: "cut source selection is empty",
    });
    expect(doc.clipboard.read()).toEqual({
      ok: false,
      code: "empty_clipboard",
      message: "clipboard is empty",
    });
    expect(doc.value).toEqual(initial);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("commands duplicate defaults to the current primary selection source", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    const duplicated = doc.commands.duplicate();

    expect(duplicated).toMatchObject({
      ok: true,
      duplicatedTo: "/items/1",
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a", "b"]);
    expect(doc.history.undoDepth).toBe(1);
  });

  test("commands duplicate accepts opts-only calls for selected object keys", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/meta/foo"] },
    });

    const duplicated = doc.commands.duplicate({ newKey: "baz" });

    expect(duplicated).toMatchObject({
      ok: true,
      duplicatedTo: "/meta/baz",
    });
    expect(doc.value.meta).toEqual({ foo: "bar", baz: "bar" });
  });

  test("commands duplicate reports empty selection when source is omitted", () => {
    const doc = createJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    });

    const duplicated = doc.commands.duplicate();

    expect(duplicated).toEqual({
      ok: false,
      code: "empty_selection",
      message: "duplicate source selection is empty",
    });
    expect(doc.value).toEqual(initial);
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
