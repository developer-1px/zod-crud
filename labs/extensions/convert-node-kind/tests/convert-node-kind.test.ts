import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canConvertNodeKind,
  convertNodeKind,
  createNodeKindConverter,
  type NodeKindConversionDescriptor,
} from "../src/index.js";

const ParagraphBlock = z.object({
  kind: z.literal("paragraph"),
  id: z.string(),
  text: z.string(),
  children: z.array(z.string()),
});

const HeadingBlock = z.object({
  kind: z.literal("heading"),
  id: z.string(),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  children: z.array(z.string()),
});

const TodoBlock = z.object({
  kind: z.literal("todo"),
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
  children: z.array(z.string()),
});

const Block = z.discriminatedUnion("kind", [
  ParagraphBlock,
  HeadingBlock,
  TodoBlock,
]);

const PageSchema = z.object({
  title: z.string(),
  blocks: z.array(Block),
});

type BlockValue = z.output<typeof Block>;

function createPage() {
  return createJSONDocument(PageSchema, {
    title: "Page",
    blocks: [
      { kind: "paragraph", id: "intro", text: "Intro", children: ["a"] },
      { kind: "heading", id: "topic", text: "Topic", level: 2, children: [] },
    ],
  });
}

const descriptor: NodeKindConversionDescriptor = {
  targetKinds: ["paragraph", "heading", "todo", "broken", "throw"],
  readKind(value) {
    return isRecord(value) && typeof value.kind === "string" ? value.kind : undefined;
  },
  canConvert({ from, to }) {
    if (from === to) return `already ${to}`;
    if (from === "todo" && to === "heading") return "todo cannot become heading in this host";
    return true;
  },
  createValue({ value, to }) {
    if (!isBlockValue(value)) throw new Error("block value expected");
    if (to === "throw") throw new Error("factory boom");
    if (to === "paragraph") {
      return {
        kind: "paragraph",
        id: value.id,
        text: value.text,
        children: value.children,
      };
    }
    if (to === "heading") {
      return {
        kind: "heading",
        id: value.id,
        text: value.text,
        level: 1,
        children: value.children,
      };
    }
    if (to === "todo") {
      return {
        kind: "todo",
        id: value.id,
        text: value.text,
        checked: false,
        children: value.children,
      };
    }
    return { kind: to, id: value.id };
  },
};

describe("@zod-crud/convert-node-kind", () => {
  test("plans and applies a schema-safe node kind conversion", () => {
    const doc = createPage();
    const converter = createNodeKindConverter(doc, descriptor);

    expect(converter.canConvert({ pointer: "/blocks/0", to: "heading" })).toMatchObject({
      ok: true,
      pointer: "/blocks/0",
      from: "paragraph",
      to: "heading",
      operation: {
        op: "replace",
        path: "/blocks/0",
        value: {
          kind: "heading",
          id: "intro",
          text: "Intro",
          level: 1,
          children: ["a"],
        },
      },
    });
    expect(doc.value.blocks[0]?.kind).toBe("paragraph");

    expect(converter.convert({ pointer: "/blocks/0", to: "heading" })).toMatchObject({
      ok: true,
      from: "paragraph",
      to: "heading",
      result: { ok: true },
    });
    expect(doc.value.blocks[0]).toEqual({
      kind: "heading",
      id: "intro",
      text: "Intro",
      level: 1,
      children: ["a"],
    });
  });

  test("preserves compatible fields through host factory rules", () => {
    const doc = createPage();

    expect(convertNodeKind(doc, descriptor, { pointer: "/blocks/1", to: "todo" })).toMatchObject({
      ok: true,
      operation: {
        value: {
          kind: "todo",
          id: "topic",
          text: "Topic",
          checked: false,
          children: [],
        },
      },
    });
    expect(doc.value.blocks[1]).toEqual({
      kind: "todo",
      id: "topic",
      text: "Topic",
      checked: false,
      children: [],
    });
  });

  test("reports invalid target and unsupported source kind", () => {
    const doc = createPage();

    expect(canConvertNodeKind(doc, descriptor, { pointer: "/blocks/99", to: "heading" })).toMatchObject({
      ok: false,
      code: "invalid_target",
      pointer: "/blocks/99",
    });
    expect(canConvertNodeKind(doc, descriptor, { pointer: "/title", to: "heading" })).toMatchObject({
      ok: false,
      code: "unsupported_kind",
      pointer: "/title",
    });
  });

  test("reports invalid target kind and host conversion denial", () => {
    const doc = createPage();

    expect(canConvertNodeKind(doc, descriptor, { pointer: "/blocks/0", to: "callout" })).toMatchObject({
      ok: false,
      code: "invalid_target_kind",
      from: "paragraph",
      to: "callout",
    });
    expect(canConvertNodeKind(doc, descriptor, { pointer: "/blocks/0", to: "paragraph" })).toMatchObject({
      ok: false,
      code: "invalid_target_kind",
      reason: "already paragraph",
    });

    doc.replace("/blocks/0", { kind: "todo", id: "intro", text: "Intro", checked: false, children: [] });
    expect(canConvertNodeKind(doc, descriptor, { pointer: "/blocks/0", to: "heading" })).toMatchObject({
      ok: false,
      code: "invalid_target_kind",
      reason: "todo cannot become heading in this host",
    });
  });

  test("reports factory failure without mutating", () => {
    const doc = createPage();

    expect(convertNodeKind(doc, descriptor, { pointer: "/blocks/0", to: "throw" })).toMatchObject({
      ok: false,
      code: "factory_failed",
      reason: "factory boom",
      from: "paragraph",
      to: "throw",
    });
    expect(doc.value.blocks[0]?.kind).toBe("paragraph");
  });

  test("reports schema rejection from core canPatch", () => {
    const doc = createPage();

    expect(convertNodeKind(doc, descriptor, { pointer: "/blocks/0", to: "broken" })).toMatchObject({
      ok: false,
      code: "patch_rejected",
      from: "paragraph",
      to: "broken",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(doc.value.blocks[0]?.kind).toBe("paragraph");
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlockValue(value: unknown): value is BlockValue {
  return Block.safeParse(value).success;
}
