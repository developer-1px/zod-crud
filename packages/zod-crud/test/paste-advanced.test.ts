import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createJsonCrud } from "../src/index.js";
import { JsonValueSchema, UiNodeSchema, createEditor } from "./test-helpers.js";

describe("JsonCrud paste-advanced", () => {
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
});
