import { describe, expect, it } from "vitest";
import * as z from "zod";

import { JsonCrud, createJsonCrud, deserialize, serialize } from "../src/index.js";

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
});
