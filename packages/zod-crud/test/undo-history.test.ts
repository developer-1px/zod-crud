import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createJsonCrud,
  type JsonValue,
} from "../src/index.js";
import { createEditor } from "./test-helpers.js";

describe("JsonCrud undo-history-schema", () => {
  it("undoes and redoes committed JSON operations", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);
    const pasteResult = editor.paste(childrenId!);

    expect(pasteResult.ok).toBe(true);

    if (pasteResult.ok) {
      expect(pasteResult.changes?.some((change) => change.type === "insert")).toBe(true);
    }

    expect(editor.toJson().kind).toBe("frame");

    const undoResult = editor.undo();

    expect(undoResult.ok).toBe(true);

    if (undoResult.ok) {
      expect(undoResult.focusNodeId).toBe(textNodeId);
      expect(undoResult.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "update", nodeId: childrenId }),
      ]));
      expect(undoResult.changes?.some((change) => change.type === "delete")).toBe(true);
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });

    const redoResult = editor.redo();
    const redoneTextNodeId = editor.find(childrenId!, 1);

    expect(redoResult.ok).toBe(true);
    expect(redoneTextNodeId).not.toBeNull();

    if (redoResult.ok) {
      expect(redoResult.focusNodeId).toBe(redoneTextNodeId);
      expect(redoResult.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "insert", nodeId: redoneTextNodeId }),
      ]));
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "hello" },
        { kind: "text", text: "hello" },
      ],
    });
  });

  it("keeps redo history after a failed mutation", () => {
    const editor = createJsonCrud(z.object({ count: z.number() }), { count: 0 });
    const countId = editor.find(editor.snapshot().rootId, "count");

    expect(editor.update(countId!, 1).ok).toBe(true);
    expect(editor.undo().ok).toBe(true);
    expect(editor.canRedo()).toBe(true);

    expect(editor.update(countId!, "bad").ok).toBe(false);
    expect(editor.toJson()).toEqual({ count: 0 });
    expect(editor.canRedo()).toBe(true);
    expect(editor.redo().ok).toBe(true);
    expect(editor.toJson()).toEqual({ count: 1 });
  });

  it("keeps successful mutations valid against the full root schema", () => {
    const Schema = z
      .object({
        items: z.array(z.string()),
        count: z.number(),
      })
      .refine((value) => value.items.length === value.count);
    const editor = createJsonCrud(Schema, { items: ["a"], count: 1 });
    const rootId = editor.snapshot().rootId;
    const itemsId = editor.find(rootId, "items");

    expect(editor.create(itemsId!, 1, "b").ok).toBe(false);
    expect(editor.toJson()).toEqual({ items: ["a"], count: 1 });
  });

  it("rejects union leaf edits that do not match the active branch", () => {
    const Schema = z.union([
      z.object({ kind: z.literal("a"), value: z.string() }),
      z.object({ kind: z.literal("b"), value: z.number() }),
    ]);
    const editor = createJsonCrud(Schema, { kind: "a", value: "ok" });
    const rootId = editor.snapshot().rootId;
    const valueId = editor.find(rootId, "value");
    const kindId = editor.find(rootId, "kind");

    expect(editor.update(valueId!, 123).ok).toBe(false);
    expect(editor.update(kindId!, "b").ok).toBe(false);
    expect(editor.toJson()).toEqual({ kind: "a", value: "ok" });
  });

  it("rejects child paste into an inactive union branch", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);

    expect(editor.paste(textNodeId!, { mode: "child" }).ok).toBe(false);
    expect(editor.read(textNodeId!)).toEqual({ kind: "text", text: "hello" });
  });

  it("accepts nullable leaf values at the final schema path", () => {
    const Schema = z.object({ items: z.array(z.string().nullable()) });
    const editor = createJsonCrud(Schema, { items: ["x"] });
    const rootId = editor.snapshot().rootId;
    const itemsId = editor.find(rootId, "items");
    const itemId = editor.find(itemsId!, 0);

    expect(editor.update(itemId!, null).ok).toBe(true);
    expect(editor.toJson()).toEqual({ items: [null] });
  });

  it("traverses record value schemas", () => {
    const Schema = z.object({
      items: z.record(z.string(), z.object({ name: z.string() })),
    });
    const editor = createJsonCrud(Schema, { items: { a: { name: "Ann" } } });
    const rootId = editor.snapshot().rootId;
    const itemsId = editor.find(rootId, "items");
    const itemId = editor.find(itemsId!, "a");
    const nameId = editor.find(itemId!, "name");

    expect(editor.update(nameId!, "Bea").ok).toBe(true);
    expect(editor.toJson()).toEqual({ items: { a: { name: "Bea" } } });
  });

  it("traverses numeric record keys like Zod does", () => {
    const Schema = z.record(z.number().int().positive(), z.object({ name: z.string() }));
    const editor = createJsonCrud(Schema, { "1": { name: "Ann" } } as z.input<typeof Schema>);
    const itemId = editor.find(editor.snapshot().rootId, "1");
    const nameId = editor.find(itemId!, "name");

    expect(editor.update(nameId!, "Bea").ok).toBe(true);
    expect(editor.toJson()).toEqual({ "1": { name: "Bea" } });

    expect(() => createJsonCrud(Schema, { "1.5": { name: "Ann" } } as z.input<typeof Schema>)).toThrow();
    expect(createJsonCrud(Schema, { "01": { name: "Cal" } } as z.input<typeof Schema>).toJson()).toEqual({
      "1": { name: "Cal" },
    });
  });

  it("edits passthrough and catchall object fields that already exist in the document", () => {
    const PassthroughSchema = z.object({ name: z.string() }).passthrough() as z.ZodType<JsonValue>;
    const passthroughEditor = createJsonCrud(PassthroughSchema, {
      name: "Ann",
      extra: 1,
    });
    const passthroughExtraId = passthroughEditor.find(passthroughEditor.snapshot().rootId, "extra");

    expect(passthroughEditor.update(passthroughExtraId!, 2).ok).toBe(true);
    expect(passthroughEditor.toJson()).toEqual({ name: "Ann", extra: 2 });

    const catchallEditor = createJsonCrud(z.object({}).catchall(z.number()), {
      extra: 1,
    });
    const catchallExtraId = catchallEditor.find(catchallEditor.snapshot().rootId, "extra");

    expect(catchallEditor.update(catchallExtraId!, 2).ok).toBe(true);
    expect(catchallEditor.update(catchallExtraId!, "bad").ok).toBe(false);
    expect(catchallEditor.toJson()).toEqual({ extra: 2 });
  });

  it("traverses intersection object fields", () => {
    const Schema = z.intersection(
      z.object({ name: z.string() }),
      z.object({ count: z.number() }),
    );
    const editor = createJsonCrud(Schema, { name: "Ann", count: 1 });
    const rootId = editor.snapshot().rootId;
    const nameId = editor.find(rootId, "name");
    const countId = editor.find(rootId, "count");

    expect(editor.update(nameId!, "Bea").ok).toBe(true);
    expect(editor.update(countId!, 2).ok).toBe(true);
    expect(editor.toJson()).toEqual({ name: "Bea", count: 2 });
  });

  it("traverses identity-like pipe schemas that keep structural JSON output", () => {
    const Schema = z.object({ name: z.string() }).transform((value) => value);
    const editor = createJsonCrud(Schema, { name: "Ann" });
    const nameId = editor.find(editor.snapshot().rootId, "name");

    expect(editor.update(nameId!, "Bea").ok).toBe(true);
    expect(editor.toJson()).toEqual({ name: "Bea" });
  });
});
