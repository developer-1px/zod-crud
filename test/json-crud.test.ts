import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  JsonCrud,
  createJsonCrud,
  deserialize,
  serialize,
  type JsonDoc,
  type JsonValue,
} from "../src/index.js";

type UiNode =
  | {
      kind: "frame";
      name: string;
      children: UiNode[];
    }
  | {
      kind: "text";
      text: string;
    };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("frame"),
      name: z.string(),
      children: z.array(UiNodeSchema),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string(),
    }),
  ]),
);

function createEditor(): JsonCrud<UiNode> {
  return createJsonCrud(UiNodeSchema, {
    kind: "frame",
    name: "root",
    children: [{ kind: "text", text: "hello" }],
  });
}

describe("flat JSON model", () => {
  it("round-trips nested JSON through a flat node table", () => {
    const value = {
      kind: "frame",
      children: [{ kind: "text", text: "hello" }],
    };

    const doc = serialize(value);

    expect(doc.rootId).toBe("n1");
    expect(Object.values(doc.nodes).map((node) => node.parentId)).toContain("n1");
    expect(deserialize(doc)).toEqual(value);
  });

  it("rejects duplicate object keys in malformed flat docs", () => {
    const doc: JsonDoc = {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "object", parentId: null, key: null, children: ["n2", "n3"] },
        n2: { id: "n2", type: "string", parentId: "n1", key: "name", children: [], value: "first" },
        n3: { id: "n3", type: "string", parentId: "n1", key: "name", children: [], value: "second" },
      },
    };

    expect(() => deserialize(doc)).toThrow("duplicate key");
  });

  it("round-trips __proto__ as an own JSON key", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as JsonValue;
    const roundTrip = deserialize(serialize(value)) as Record<string, JsonValue>;

    expect(Object.prototype.hasOwnProperty.call(roundTrip, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(roundTrip)).toBe(Object.prototype);
  });
});

describe("JsonCrud", () => {
  it("updates a subtree when the Zod schema at that path accepts the value", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    expect(childrenId).not.toBeNull();

    const textNodeId = editor.find(childrenId!, 0);
    expect(textNodeId).not.toBeNull();

    const textValueId = editor.find(textNodeId!, "text");
    expect(textValueId).not.toBeNull();

    expect(editor.update(textValueId!, 123).ok).toBe(false);
    expect(editor.update(textValueId!, "changed").ok).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "changed" }],
    });
  });

  it("pastes into children when the children item schema accepts the clipboard payload", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);

    expect(editor.paste(rootId).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "hello" },
        { kind: "text", text: "hello" },
      ],
    });
  });

  it("pastes a copied node onto itself as an array sibling before trying child arrays", () => {
    const editor = createJsonCrud(UiNodeSchema, {
      kind: "frame",
      name: "root",
      children: [
        {
          kind: "frame",
          name: "section",
          children: [],
        },
      ],
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const sectionId = editor.find(childrenId!, 0);

    editor.copy(sectionId!);

    expect(editor.paste(sectionId!).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        {
          kind: "frame",
          name: "section",
          children: [],
        },
        {
          kind: "frame",
          name: "section",
          children: [],
        },
      ],
    });
  });

  it("rejects paste when neither child insertion nor overwrite matches the target schema", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);
    const textValueId = editor.find(textNodeId!, "text");

    editor.copy(textValueId!);

    expect(editor.paste(rootId).ok).toBe(false);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });
  });

  it("undoes and redoes committed JSON operations", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);
    expect(editor.paste(rootId).ok).toBe(true);
    expect(editor.toJson().kind).toBe("frame");

    expect(editor.undo()).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });

    expect(editor.redo()).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "hello" },
        { kind: "text", text: "hello" },
      ],
    });
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
    expect(editor.paste(slotId!, { mode: "overwrite" }).ok).toBe(true);
    expect(editor.toJson()).toEqual({ items: ["a"], slot: "old" });
  });
});
