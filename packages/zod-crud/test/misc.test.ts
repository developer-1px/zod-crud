import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createJsonCrud,
  type JsonValue,
} from "../src/index.js";
import { createEditor } from "./test-helpers.js";

describe("JsonCrud misc-edge-cases", () => {
  it("rejects mutations when Zod would strip or coerce the committed value", () => {
    const ObjectSchema = z.object({ name: z.string() });
    const objectEditor = createJsonCrud(ObjectSchema, { name: "Ann" });

    expect(objectEditor.create(objectEditor.snapshot().rootId, "extra", 1).ok).toBe(false);
    expect(objectEditor.toJson()).toEqual({ name: "Ann" });

    const CoerceSchema = z.object({ count: z.coerce.number() });
    const coerceEditor = createJsonCrud(CoerceSchema, { count: 0 });
    const countId = coerceEditor.find(coerceEditor.snapshot().rootId, "count");

    expect(coerceEditor.update(countId!, "5").ok).toBe(false);
    expect(coerceEditor.toJson()).toEqual({ count: 0 });
  });

  it("accepts valid schema input values that differ from schema output", () => {
    const Schema = z.object({ name: z.string().default("untitled") });
    const editor = createJsonCrud(Schema, {});

    expect(editor.toJson()).toEqual({ name: "untitled" });
  });

  it("types createJsonCrud with the schema input", () => {
    if (false) {
      // @ts-expect-error count must be a number for this schema input.
      createJsonCrud(z.object({ count: z.number() }), { count: "bad" });
    }

    const editor = createJsonCrud(z.object({ count: z.number() }), { count: 1 });
    expect(editor.toJson()).toEqual({ count: 1 });
  });

  it("rejects schemas whose parsed output cannot be validated again as stored JSON", () => {
    const Schema = z.string().transform((value) => value.length);

    expect(() => createJsonCrud(Schema, "abc")).toThrow("Document does not match the root schema");
  });

  it("rejects non-integer array insertion indexes", () => {
    const editor = createJsonCrud(z.array(z.string()), ["a", "b"]);
    const rootId = editor.snapshot().rootId;

    expect(editor.create(rootId, 0.5, "x").ok).toBe(false);
    expect(editor.create(rootId, Number.NaN, "x").ok).toBe(false);
    expect(editor.toJson()).toEqual(["a", "b"]);
  });

  it("does not turn a failed self-sibling paste into a no-op overwrite", () => {
    const editor = createJsonCrud(z.array(z.string()).max(1), ["a"]);
    const itemId = editor.find(editor.snapshot().rootId, 0);

    editor.copy(itemId!);

    expect(editor.paste(itemId!).ok).toBe(false);
    expect(editor.undo().ok).toBe(false);
    expect(editor.toJson()).toEqual(["a"]);
  });

  it("does not reuse node ids after delete when resolving clipboard source behavior", () => {
    const ChildSchema = z.object({ label: z.string() });
    const ItemSchema = z.object({
      label: z.string(),
      children: z.array(ChildSchema).optional(),
    });
    const Schema = z.object({ children: z.array(ItemSchema) }) as z.ZodType<JsonValue>;
    const editor = createJsonCrud(Schema, {
      children: [{ label: "old" }],
    });
    const childrenId = editor.find(editor.snapshot().rootId, "children");
    const oldId = editor.find(childrenId!, 0);

    editor.copy(oldId!);
    expect(editor.delete(oldId!).ok).toBe(true);
    expect(editor.create(childrenId!, 0, { label: "new" }).ok).toBe(true);

    const newId = editor.find(childrenId!, 0);
    expect(newId).not.toBe(oldId);
    expect(editor.paste(newId!, { mode: "child" }).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      children: [{ label: "new", children: [{ label: "old" }] }],
    });
  });

  it("returns failures for invalid ids without mutating canPaste state", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;

    editor.copy(rootId);

    expect(editor.create("missing", "x", "value").ok).toBe(false);
    expect(editor.update("missing", "value").ok).toBe(false);
    expect(editor.delete("missing").ok).toBe(false);
    expect(editor.cut("missing").ok).toBe(false);
    expect(editor.paste("missing").ok).toBe(false);
    expect(editor.canPaste("missing").ok).toBe(false);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });
  });

  it("notifies subscribers after committed document mutations", () => {
    const editor = createJsonCrud(z.object({ items: z.array(z.string()) }), { items: [] });
    const rootId = editor.snapshot().rootId;
    const itemsId = editor.find(rootId, "items");
    let calls = 0;
    const unsubscribe = editor.subscribe(() => {
      calls += 1;
    });

    expect(editor.create(itemsId!, 0, "a").ok).toBe(true);
    editor.copy(itemsId!);
    expect(calls).toBe(1);

    expect(editor.undo().ok).toBe(true);
    expect(calls).toBe(2);

    unsubscribe();
    expect(editor.redo().ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("filters focus candidates after deletion", () => {
    const Schema: z.ZodType<JsonValue> = z.object({
      children: z.array(z.object({
        text: z.string(),
        children: z.array(z.object({ text: z.string(), children: z.array(z.never()) })),
      })),
    });
    const editor = createJsonCrud(Schema, {
      children: [
        { text: "only", children: [] },
      ],
    }, {
      focusFilter: (doc, candidateId) => doc.nodes[candidateId]?.type === "object",
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const itemId = editor.find(childrenId!, 0);
    const result = editor.delete(itemId!);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.focusNodeId).toBe(rootId);
    }
  });

  it("inserts before and after array siblings", () => {
    const editor = createJsonCrud(z.object({ items: z.array(z.string()) }), {
      items: ["b"],
    });
    const itemsId = editor.find(editor.snapshot().rootId, "items");
    const bId = editor.find(itemsId!, 0);

    const before = editor.insertBefore(bId!, "a");
    expect(before.ok).toBe(true);

    const currentBId = editor.find(itemsId!, 1);
    const after = editor.insertAfter(currentBId!, "c");
    expect(after.ok).toBe(true);
    expect(editor.toJson()).toEqual({ items: ["a", "b", "c"] });
  });

  it("appends to configured child arrays and creates missing child arrays", () => {
    const ItemSchema = z.object({
      label: z.string(),
      children: z.array(z.object({ label: z.string() })).optional(),
    });
    const Schema = z.object({ items: z.array(ItemSchema) }) as z.ZodType<JsonValue>;
    const editor = createJsonCrud(Schema, {
      items: [{ label: "parent" }],
    }, {
      childKeys: ["children"],
    });
    const itemsId = editor.find(editor.snapshot().rootId, "items");
    const parentId = editor.find(itemsId!, 0);
    const result = editor.appendChild(parentId!, { label: "child" });

    expect(result.ok).toBe(true);
    expect(editor.toJson()).toEqual({
      items: [{ label: "parent", children: [{ label: "child" }] }],
    });
  });

  it("creates values from defaultFor or schema defaults when value is omitted", () => {
    const editor = createJsonCrud(z.object({ items: z.array(z.string()) }), {
      items: [],
    }, {
      defaultFor: () => "from-option",
    });
    const itemsId = editor.find(editor.snapshot().rootId, "items");

    expect(editor.create(itemsId!, 0).ok).toBe(true);
    expect(editor.toJson()).toEqual({ items: ["from-option"] });

    const schemaDefaultEditor = createJsonCrud(z.object({
      items: z.array(z.string().default("from-schema")),
    }), {
      items: [],
    });
    const schemaItemsId = schemaDefaultEditor.find(schemaDefaultEditor.snapshot().rootId, "items");

    expect(schemaDefaultEditor.create(schemaItemsId!, 0).ok).toBe(true);
    expect(schemaDefaultEditor.toJson()).toEqual({ items: ["from-schema"] });
  });

  it("does not replace the clipboard when cut fails", () => {
    const Schema = z.object({
      items: z.array(z.string()).min(1),
      slot: z.string(),
    });
    const editor = createJsonCrud(Schema, { items: ["a"], slot: "old" });
    const rootId = editor.snapshot().rootId;
    const itemsId = editor.find(rootId, "items");
    const itemId = editor.find(itemsId!, 0);
    const slotId = editor.find(rootId, "slot");

    editor.copy(slotId!);

    expect(editor.cut(itemId!).ok).toBe(false);
    expect(editor.update(slotId!, "target").ok).toBe(true);
    const pasteResult = editor.paste(slotId!, { mode: "overwrite" });

    expect(pasteResult.ok).toBe(true);

    if (pasteResult.ok) {
      expect(pasteResult.nodeId).toBe(slotId);
    }

    expect(editor.toJson()).toEqual({ items: ["a"], slot: "old" });
  });

  it("does not replace the clipboard when paste fails", () => {
    const Schema = z.object({
      source: z.string(),
      slot: z.string(),
      count: z.number(),
    });
    const editor = createJsonCrud(Schema, {
      source: "copied",
      slot: "target",
      count: 1,
    });
    const rootId = editor.snapshot().rootId;
    const sourceId = editor.find(rootId, "source");
    const slotId = editor.find(rootId, "slot");
    const countId = editor.find(rootId, "count");

    editor.copy(sourceId!);

    expect(editor.paste(countId!, { mode: "overwrite" }).ok).toBe(false);
    expect(editor.canUndo()).toBe(false);

    const pasteResult = editor.paste(slotId!, { mode: "overwrite" });

    expect(pasteResult.ok).toBe(true);
    expect(editor.toJson()).toEqual({
      source: "copied",
      slot: "copied",
      count: 1,
    });
  });
});
