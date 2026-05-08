import { describe, expect, it } from "vitest";

import { createJsonCrud } from "../src/index.js";
import { UiNodeSchema, createEditor } from "./test-helpers.js";

describe("JsonCrud many-ops", () => {
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
});
