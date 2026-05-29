import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument, type Pointer } from "zod-crud";
import {
  canUnwrapSelection,
  canWrapSelection,
  createWrapUnwrap,
  unwrapSelection,
  wrapSelection,
  type WrapUnwrapAdapter,
} from "../src/index.js";

type Block =
  | { id: string; kind: "paragraph"; text: string }
  | { id: string; kind: "callout"; title: string; children: Block[] };

const BlockSchema: z.ZodType<Block> = z.lazy(() => z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("paragraph"),
    text: z.string(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("callout"),
    title: z.string(),
    children: z.array(BlockSchema),
  }),
]));

const PageSchema = z.object({
  blocks: z.array(BlockSchema),
});

const wrapAdapter: WrapUnwrapAdapter = {
  isWrapper(value) {
    return isRecord(value) && value.kind === "callout" && Array.isArray(value.children);
  },
  getChildren(value) {
    return isRecord(value) && Array.isArray(value.children) ? value.children : null;
  },
  createWrapper(children, context) {
    return {
      id: `callout-${context.insertIndex}`,
      kind: "callout",
      title: `Callout ${context.source.length}`,
      children,
    };
  },
};

function createPage() {
  return createJSONDocument(PageSchema, {
    blocks: [
      { id: "a", kind: "paragraph", text: "Alpha" },
      { id: "b", kind: "paragraph", text: "Beta" },
      { id: "c", kind: "paragraph", text: "Gamma" },
    ],
  });
}

describe("@zod-crud/wrap-unwrap", () => {
  test("wraps a single sibling item in one schema-valid wrapper", () => {
    const doc = createPage();
    const wrappers = createWrapUnwrap(doc, wrapAdapter);

    expect(wrappers.canWrap("/blocks/1")).toMatchObject({
      ok: true,
      operation: "wrap",
      parent: "/blocks",
      source: ["/blocks/1"],
      selectionAfter: ["/blocks/1"],
    });

    expect(wrappers.wrap("/blocks/1")).toMatchObject({
      ok: true,
      selectionAfter: ["/blocks/1"],
    });
    expect(doc.value.blocks).toEqual([
      { id: "a", kind: "paragraph", text: "Alpha" },
      {
        id: "callout-1",
        kind: "callout",
        title: "Callout 1",
        children: [
          { id: "b", kind: "paragraph", text: "Beta" },
        ],
      },
      { id: "c", kind: "paragraph", text: "Gamma" },
    ]);
  });

  test("wraps multiple contiguous sibling items while preserving order", () => {
    const doc = createPage();

    expect(wrapSelection(doc, wrapAdapter, ["/blocks/0", "/blocks/1"])).toMatchObject({
      ok: true,
      source: ["/blocks/0", "/blocks/1"],
      operations: [
        { op: "remove", path: "/blocks/1" },
        { op: "remove", path: "/blocks/0" },
        {
          op: "add",
          path: "/blocks/0",
          value: {
            id: "callout-0",
            kind: "callout",
            title: "Callout 2",
            children: [
              { id: "a", kind: "paragraph", text: "Alpha" },
              { id: "b", kind: "paragraph", text: "Beta" },
            ],
          },
        },
      ],
    });
    expect(doc.value.blocks.map((block) => block.id)).toEqual(["callout-0", "c"]);
  });

  test("unwraps a wrapper back into its parent while selecting the children", () => {
    const doc = createPage();
    wrapSelection(doc, wrapAdapter, ["/blocks/0", "/blocks/1"]);

    expect(canUnwrapSelection(doc, wrapAdapter, "/blocks/0")).toMatchObject({
      ok: true,
      operation: "unwrap",
      parent: "/blocks",
      selectionAfter: ["/blocks/0", "/blocks/1"],
    });
    expect(unwrapSelection(doc, wrapAdapter, "/blocks/0")).toMatchObject({
      ok: true,
      selectionAfter: ["/blocks/0", "/blocks/1"],
    });
    expect(doc.value.blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
  });

  test("deduplicates selected pointers and prunes nested descendants before wrapping", () => {
    const doc = createJSONDocument(PageSchema, {
      blocks: [
        { id: "a", kind: "paragraph", text: "Alpha" },
        {
          id: "callout",
          kind: "callout",
          title: "Nested",
          children: [{ id: "b", kind: "paragraph", text: "Beta" }],
        },
        { id: "c", kind: "paragraph", text: "Gamma" },
      ],
    });

    const result = wrapSelection(doc, wrapAdapter, [
      "/blocks/0",
      "/blocks/1",
      "/blocks/1",
      "/blocks/1/children/0" as Pointer,
    ]);

    expect(result).toMatchObject({
      ok: true,
      source: ["/blocks/0", "/blocks/1"],
    });
    expect(doc.value.blocks).toHaveLength(2);
    expect(doc.value.blocks[0]).toMatchObject({
      id: "callout-0",
      kind: "callout",
      children: [
        { id: "a" },
        { id: "callout" },
      ],
    });
  });

  test("rejects mixed parents, non-contiguous selections, and non-wrapper unwrap sources", () => {
    const doc = createJSONDocument(PageSchema, {
      blocks: [
        { id: "a", kind: "paragraph", text: "Alpha" },
        {
          id: "callout",
          kind: "callout",
          title: "Nested",
          children: [{ id: "b", kind: "paragraph", text: "Beta" }],
        },
        { id: "c", kind: "paragraph", text: "Gamma" },
      ],
    });

    expect(canWrapSelection(doc, wrapAdapter, ["/blocks/0", "/blocks/1/children/0" as Pointer])).toMatchObject({
      ok: false,
      code: "mixed_parent",
    });
    expect(canWrapSelection(doc, wrapAdapter, ["/blocks/0", "/blocks/99" as Pointer])).toMatchObject({
      ok: false,
      code: "path_not_found",
    });
    expect(canWrapSelection(doc, wrapAdapter, ["/blocks/0", "/blocks/2"])).toMatchObject({
      ok: false,
      code: "non_contiguous_selection",
    });
    expect(canUnwrapSelection(doc, wrapAdapter, "/blocks/0")).toMatchObject({
      ok: false,
      code: "not_wrapper",
    });
  });

  test("surfaces core schema rejection when the wrapper factory creates invalid JSON", () => {
    const doc = createPage();
    const invalidAdapter: WrapUnwrapAdapter = {
      ...wrapAdapter,
      createWrapper() {
        return {
          id: "bad",
          kind: "callout",
          title: "Missing children",
        };
      },
    };

    expect(canWrapSelection(doc, invalidAdapter, ["/blocks/0"])).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(doc.value.blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
