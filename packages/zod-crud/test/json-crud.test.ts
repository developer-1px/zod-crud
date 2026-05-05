import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createJsonCrud,
  deserialize,
  serialize,
  type JsonDoc,
  type JsonCrud,
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
    const result = editor.update(textValueId!, "changed");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.focusNodeId).toBe(textValueId);
      expect(result.changes).toEqual([
        expect.objectContaining({
          type: "update",
          nodeId: textValueId,
          before: expect.objectContaining({ value: "hello" }),
          after: expect.objectContaining({ value: "changed" }),
        }),
      ]);
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "changed" }],
    });
  });

  it("renames an object child key without replacing the subtree", () => {
    const editor = createJsonCrud(JsonValueSchema, {
      name: "Ada",
      profile: { active: true },
    });
    const rootId = editor.snapshot().rootId;
    const nameId = editor.find(rootId, "name");

    expect(nameId).not.toBeNull();
    const result = editor.rename(nameId!, "title");

    expect(result.ok).toBe(true);
    expect(editor.find(rootId, "name")).toBeNull();
    expect(editor.find(rootId, "title")).toBe(nameId);
    expect(editor.toJson()).toEqual({
      title: "Ada",
      profile: { active: true },
    });

    if (result.ok) {
      expect(result.nodeId).toBe(nameId);
      expect(result.focusNodeId).toBe(nameId);
      expect(result.changes).toEqual([
        expect.objectContaining({
          type: "update",
          nodeId: nameId,
          before: expect.objectContaining({ key: "name", value: "Ada" }),
          after: expect.objectContaining({ key: "title", value: "Ada" }),
        }),
      ]);
    }

    expect(editor.undo().ok).toBe(true);
    expect(editor.toJson()).toEqual({
      name: "Ada",
      profile: { active: true },
    });

    expect(editor.redo().ok).toBe(true);
    expect(editor.toJson()).toEqual({
      title: "Ada",
      profile: { active: true },
    });
  });

  it("rejects invalid object key renames", () => {
    const editor = createJsonCrud(JsonValueSchema, {
      name: "Ada",
      title: "Engineer",
      items: ["first"],
    });
    const rootId = editor.snapshot().rootId;
    const nameId = editor.find(rootId, "name");
    const itemsId = editor.find(rootId, "items");
    const itemId = editor.find(itemsId!, 0);

    expect(editor.rename(rootId, "document").ok).toBe(false);
    expect(editor.rename(nameId!, "title")).toEqual({
      ok: false,
      reason: "Object key already exists: title.",
    });
    expect(editor.rename(itemId!, "label")).toEqual({
      ok: false,
      reason: "Only object child keys can be renamed.",
    });
    expect(editor.toJson()).toEqual({
      name: "Ada",
      title: "Engineer",
      items: ["first"],
    });
  });

  it("rejects object key renames that violate the Zod schema", () => {
    const editor = createJsonCrud(z.object({
      name: z.string(),
    }), {
      name: "Ada",
    });
    const nameId = editor.find(editor.snapshot().rootId, "name");
    const result = editor.rename(nameId!, "title");

    expect(result.ok).toBe(false);
    expect(editor.toJson()).toEqual({ name: "Ada" });
  });

  it("pastes into arrays before trying overwrite", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);

    const result = editor.paste(childrenId!);
    const pastedTextNodeId = editor.find(childrenId!, 1);

    expect(result.ok).toBe(true);
    expect(pastedTextNodeId).not.toBeNull();

    if (result.ok) {
      expect(result.nodeId).toBe(pastedTextNodeId);
      expect(result.focusNodeId).toBe(pastedTextNodeId);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "update", nodeId: childrenId }),
        expect.objectContaining({ type: "insert", nodeId: pastedTextNodeId }),
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

  it("pastes onto objects by overwriting the target object", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    editor.copy(textNodeId!);

    const result = editor.paste(rootId);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.nodeId).toBe(rootId);
      expect(result.focusNodeId).toBe(rootId);
    }

    expect(editor.toJson()).toEqual({ kind: "text", text: "hello" });
  });

  it("pastes onto leaf nodes only when the JSON node type matches", () => {
    const Schema = z.object({
      source: z.number(),
      target: z.union([z.string(), z.number()]),
      text: z.string(),
    });
    const editor = createJsonCrud(Schema, {
      source: 1,
      target: "old",
      text: "new",
    });
    const rootId = editor.snapshot().rootId;
    const sourceId = editor.find(rootId, "source");
    const targetId = editor.find(rootId, "target");
    const textId = editor.find(rootId, "text");

    editor.copy(sourceId!);
    expect(editor.paste(targetId!).ok).toBe(false);

    editor.copy(textId!);
    const result = editor.paste(targetId!);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.nodeId).toBe(targetId);
      expect(result.focusNodeId).toBe(targetId);
    }

    expect(editor.toJson()).toEqual({
      source: 1,
      target: "new",
      text: "new",
    });
  });

  it("uses the same mutation focus strategy when deleting a node", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    const result = editor.delete(textNodeId!);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.nodeId).toBe(textNodeId);
      expect(result.focusNodeId).toBe(childrenId);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "update", nodeId: childrenId }),
        expect.objectContaining({ type: "delete", nodeId: textNodeId }),
      ]));
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [],
    });
  });

  it("recovers direct delete focus through next, previous, parent, then root", () => {
    const editor = createJsonCrud(UiNodeSchema, {
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
      ],
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const firstId = editor.find(childrenId!, 0);
    const secondId = editor.find(childrenId!, 1);
    const thirdId = editor.find(childrenId!, 2);

    const deleteMiddle = editor.delete(secondId!);

    expect(deleteMiddle.ok).toBe(true);

    if (deleteMiddle.ok) {
      expect(deleteMiddle.focusNodeId).toBe(thirdId);
    }

    const deleteLast = editor.delete(thirdId!);

    expect(deleteLast.ok).toBe(true);

    if (deleteLast.ok) {
      expect(deleteLast.focusNodeId).toBe(firstId);
    }

    const deleteOnlyChild = editor.delete(firstId!);

    expect(deleteOnlyChild.ok).toBe(true);

    if (deleteOnlyChild.ok) {
      expect(deleteOnlyChild.focusNodeId).toBe(childrenId);
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [],
    });
  });

  it("deletes sibling nodes as one batch mutation", () => {
    const editor = createJsonCrud(UiNodeSchema, {
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
        { kind: "text", text: "fourth" },
      ],
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const firstId = editor.find(childrenId!, 0);
    const secondId = editor.find(childrenId!, 1);
    const thirdId = editor.find(childrenId!, 2);
    const fourthId = editor.find(childrenId!, 3);

    const result = editor.deleteMany([secondId!, thirdId!]);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.focusNodeId).toBe(fourthId);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "update", nodeId: childrenId }),
        expect.objectContaining({ type: "delete", nodeId: secondId }),
        expect.objectContaining({ type: "delete", nodeId: thirdId }),
      ]));
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "fourth" },
      ],
    });

    const undoResult = editor.undo();

    expect(undoResult.ok).toBe(true);

    if (undoResult.ok) {
      expect(undoResult.focusNodeId).toBe(thirdId);
      expect(undoResult.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "insert", nodeId: secondId }),
        expect.objectContaining({ type: "insert", nodeId: thirdId }),
      ]));
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
        { kind: "text", text: "fourth" },
      ],
    });

    const redoResult = editor.redo();

    expect(redoResult.ok).toBe(true);

    if (redoResult.ok) {
      expect(redoResult.focusNodeId).toBe(fourthId);
    }
    expect(editor.find(childrenId!, 0)).toBe(firstId);
    expect(editor.find(childrenId!, 1)).toBe(fourthId);
  });

  it("rejects deleteMany when selected nodes are not siblings", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const nameId = editor.find(rootId, "name");
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    const result = editor.deleteMany([nameId!, textNodeId!]);

    expect(result.ok).toBe(false);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });
    expect(editor.canUndo()).toBe(false);
  });

  it("reports multi-node command capability without mutating state", () => {
    const editor = createEditor();
    const rootId = editor.snapshot().rootId;
    const nameId = editor.find(rootId, "name");
    const childrenId = editor.find(rootId, "children");
    const textNodeId = editor.find(childrenId!, 0);

    expect(editor.canCopyMany([]).ok).toBe(false);
    expect(editor.canCopyMany([rootId]).ok).toBe(true);
    expect(editor.canCutMany([rootId]).ok).toBe(false);
    expect(editor.canDeleteMany([rootId]).ok).toBe(false);
    expect(editor.canDeleteMany([nameId!, textNodeId!]).ok).toBe(false);
    expect(editor.canCutMany([textNodeId!]).ok).toBe(true);

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [{ kind: "text", text: "hello" }],
    });
    expect(editor.canUndo()).toBe(false);
  });

  it("copies multiple nodes and pastes them into an array target in order", () => {
    const editor = createJsonCrud(UiNodeSchema, {
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
      ],
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const firstId = editor.find(childrenId!, 0);
    const secondId = editor.find(childrenId!, 1);

    const copied = editor.copyMany([firstId!, secondId!]);
    const result = editor.paste(childrenId!);
    const firstPastedId = editor.find(childrenId!, 3);
    const secondPastedId = editor.find(childrenId!, 4);

    expect(copied).toEqual([
      { kind: "text", text: "first" },
      { kind: "text", text: "second" },
    ]);
    expect(result.ok).toBe(true);
    expect(firstPastedId).not.toBeNull();
    expect(secondPastedId).not.toBeNull();

    if (result.ok) {
      expect(result.focusNodeId).toBe(secondPastedId);
      expect(result.focusNodeIds).toEqual([firstPastedId, secondPastedId]);
      expect(result.changes).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "insert", nodeId: firstPastedId }),
        expect.objectContaining({ type: "insert", nodeId: secondPastedId }),
      ]));
    }

    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
      ],
    });
  });

  it("cuts multiple sibling nodes and keeps them pasteable as a batch", () => {
    const editor = createJsonCrud(UiNodeSchema, {
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
        { kind: "text", text: "third" },
      ],
    });
    const rootId = editor.snapshot().rootId;
    const childrenId = editor.find(rootId, "children");
    const firstId = editor.find(childrenId!, 0);
    const secondId = editor.find(childrenId!, 1);

    const cutResult = editor.cutMany([firstId!, secondId!]);

    expect(cutResult.ok).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "third" },
      ],
    });

    const pasteResult = editor.paste(childrenId!);

    expect(pasteResult.ok).toBe(true);
    expect(editor.toJson()).toEqual({
      kind: "frame",
      name: "root",
      children: [
        { kind: "text", text: "third" },
        { kind: "text", text: "first" },
        { kind: "text", text: "second" },
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

    const result = editor.paste(sectionId!);
    const pastedSectionId = editor.find(childrenId!, 1);

    expect(result.ok).toBe(true);
    expect(pastedSectionId).not.toBeNull();

    if (result.ok) {
      expect(result.nodeId).toBe(pastedSectionId);
    }

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

  it("keeps repeated self-paste on the newly pasted sibling instead of falling through to child paste", () => {
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
    const pastedSectionId = editor.find(childrenId!, 1);

    expect(pastedSectionId).not.toBeNull();
    expect(editor.paste(pastedSectionId!).ok).toBe(true);
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
        {
          kind: "frame",
          name: "section",
          children: [],
        },
      ],
    });
  });

  it("does not update clipboard source semantics during canPaste dry runs", () => {
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

    expect(editor.canPaste(sectionId!).ok).toBe(true);
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

  it("does not consume node ids during canPaste dry runs", () => {
    function pasteAfterCopy({ dryRun }: { dryRun: boolean }) {
      const editor = createEditor();
      const rootId = editor.snapshot().rootId;
      const childrenId = editor.find(rootId, "children");
      const textNodeId = editor.find(childrenId!, 0);

      editor.copy(textNodeId!);

      if (dryRun) {
        expect(editor.canPaste(childrenId!).ok).toBe(true);
        expect(editor.canPaste(childrenId!).ok).toBe(true);
      }

      const result = editor.paste(childrenId!);

      return {
        doc: editor.snapshot(),
        json: editor.toJson(),
        result,
      };
    }

    const probed = pasteAfterCopy({ dryRun: true });
    const direct = pasteAfterCopy({ dryRun: false });

    expect(probed.result.ok).toBe(true);
    expect(direct.result.ok).toBe(true);

    if (probed.result.ok && direct.result.ok) {
      expect(probed.result.nodeId).toBe(direct.result.nodeId);
    }

    expect(probed.json).toEqual(direct.json);
    expect(probed.doc).toEqual(direct.doc);
  });

  it("discovers explicit child paste arrays from the Zod schema instead of child key conventions only", () => {
    const Schema = z.object({
      items: z.array(z.string()),
      selected: z.string(),
    });
    const editor = createJsonCrud(Schema, {
      items: [],
      selected: "hello",
    });
    const rootId = editor.snapshot().rootId;
    const selectedId = editor.find(rootId, "selected");

    editor.copy(selectedId!);

    expect(editor.paste(rootId, { mode: "child" }).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      items: ["hello"],
      selected: "hello",
    });
  });

  it("tries schema-discovered array candidates until Zod accepts one", () => {
    const Schema = z.object({
      numbers: z.array(z.number()),
      strings: z.array(z.string()),
      selected: z.string(),
    });
    const editor = createJsonCrud(Schema, {
      numbers: [],
      strings: [],
      selected: "hello",
    });
    const rootId = editor.snapshot().rootId;
    const selectedId = editor.find(rootId, "selected");

    editor.copy(selectedId!);

    expect(editor.paste(rootId, { mode: "child" }).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      numbers: [],
      strings: ["hello"],
      selected: "hello",
    });
  });

  it("prefers Zod-declared array fields over child key fallbacks", () => {
    const Schema = z.object({
      items: z.array(z.string()),
      selected: z.string(),
    }).catchall(JsonValueSchema);
    const editor = createJsonCrud(Schema, {
      items: [],
      selected: "hello",
    });
    const rootId = editor.snapshot().rootId;
    const selectedId = editor.find(rootId, "selected");

    editor.copy(selectedId!);

    expect(editor.paste(rootId, { mode: "child" }).ok).toBe(true);
    expect(editor.toJson()).toEqual({
      items: ["hello"],
      selected: "hello",
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
