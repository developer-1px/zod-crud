import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createJsonCrud } from "../src/index.js";
import { JsonValueSchema, UiNodeSchema, createEditor } from "./test-helpers.js";

describe("JsonCrud mutations", () => {
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
});
