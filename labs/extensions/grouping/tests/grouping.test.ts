import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument, type Pointer } from "zod-crud";
import {
  canGroupSelection,
  canUngroupSelection,
  createGrouping,
  groupSelection,
  ungroupSelection,
  type GroupingAdapter,
} from "../src/index.js";

type Node =
  | { id: string; kind: "item"; title: string }
  | { id: string; kind: "group"; title: string; children: Node[] };

const NodeSchema: z.ZodType<Node> = z.lazy(() => z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("item"),
    title: z.string(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("group"),
    title: z.string(),
    children: z.array(NodeSchema),
  }),
]));

const BoardSchema = z.object({
  nodes: z.array(NodeSchema),
});

const groupingAdapter: GroupingAdapter = {
  isGroup(value) {
    return isRecord(value) && value.kind === "group" && Array.isArray(value.children);
  },
  getChildren(value) {
    return isRecord(value) && Array.isArray(value.children) ? value.children : null;
  },
  createGroup(children, context) {
    return {
      id: `group-${context.insertIndex}`,
      kind: "group",
      title: `Group ${context.source.length}`,
      children,
    };
  },
};

function createBoard() {
  return createJSONDocument(BoardSchema, {
    nodes: [
      { id: "a", kind: "item", title: "Alpha" },
      { id: "b", kind: "item", title: "Beta" },
      { id: "c", kind: "item", title: "Gamma" },
    ],
  });
}

describe("@zod-crud/grouping", () => {
  test("groups selected sibling items into one schema-valid group", () => {
    const doc = createBoard();
    const grouping = createGrouping(doc, groupingAdapter);

    expect(grouping.canGroup(["/nodes/0", "/nodes/1"])).toMatchObject({
      ok: true,
      operation: "group",
      parent: "/nodes",
      source: ["/nodes/0", "/nodes/1"],
      selectionAfter: ["/nodes/0"],
    });

    expect(grouping.group(["/nodes/0", "/nodes/1"])).toMatchObject({
      ok: true,
      selectionAfter: ["/nodes/0"],
    });
    expect(doc.value.nodes).toEqual([
      {
        id: "group-0",
        kind: "group",
        title: "Group 2",
        children: [
          { id: "a", kind: "item", title: "Alpha" },
          { id: "b", kind: "item", title: "Beta" },
        ],
      },
      { id: "c", kind: "item", title: "Gamma" },
    ]);
  });

  test("ungroups a group back into its parent while selecting the children", () => {
    const doc = createBoard();
    groupSelection(doc, groupingAdapter, ["/nodes/0", "/nodes/1"]);

    expect(canUngroupSelection(doc, groupingAdapter, "/nodes/0")).toMatchObject({
      ok: true,
      operation: "ungroup",
      parent: "/nodes",
      selectionAfter: ["/nodes/0", "/nodes/1"],
    });
    expect(ungroupSelection(doc, groupingAdapter, "/nodes/0")).toMatchObject({
      ok: true,
      selectionAfter: ["/nodes/0", "/nodes/1"],
    });
    expect(doc.value.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  test("deduplicates selected pointers and prunes nested descendants before grouping", () => {
    const doc = createJSONDocument(BoardSchema, {
      nodes: [
        { id: "a", kind: "item", title: "Alpha" },
        {
          id: "g",
          kind: "group",
          title: "Nested",
          children: [{ id: "b", kind: "item", title: "Beta" }],
        },
        { id: "c", kind: "item", title: "Gamma" },
      ],
    });

    const result = groupSelection(doc, groupingAdapter, [
      "/nodes/0",
      "/nodes/1",
      "/nodes/1",
      "/nodes/1/children/0" as Pointer,
    ]);

    expect(result).toMatchObject({
      ok: true,
      source: ["/nodes/0", "/nodes/1"],
    });
    expect(doc.value.nodes).toHaveLength(2);
    expect(doc.value.nodes[0]).toMatchObject({
      id: "group-0",
      kind: "group",
      children: [
        { id: "a" },
        { id: "g" },
      ],
    });
  });

  test("rejects mixed parents, non-contiguous selections, single selections, and non-group ungroup sources", () => {
    const doc = createJSONDocument(BoardSchema, {
      nodes: [
        { id: "a", kind: "item", title: "Alpha" },
        {
          id: "g",
          kind: "group",
          title: "Nested",
          children: [{ id: "b", kind: "item", title: "Beta" }],
        },
      ],
    });

    expect(canGroupSelection(doc, groupingAdapter, ["/nodes/0", "/nodes/1/children/0" as Pointer])).toMatchObject({
      ok: false,
      code: "mixed_parent",
    });
    expect(canGroupSelection(doc, groupingAdapter, ["/nodes/0", "/nodes/2" as Pointer])).toMatchObject({
      ok: false,
      code: "path_not_found",
    });
    expect(canGroupSelection(doc, groupingAdapter, ["/nodes/0"])).toMatchObject({
      ok: false,
      code: "too_few_items",
    });
    expect(canUngroupSelection(doc, groupingAdapter, "/nodes/0")).toMatchObject({
      ok: false,
      code: "not_group",
    });
  });

  test("rejects non-contiguous sibling selection because grouping should not reorder", () => {
    const doc = createBoard();

    expect(canGroupSelection(doc, groupingAdapter, ["/nodes/0", "/nodes/2"])).toMatchObject({
      ok: false,
      code: "non_contiguous_selection",
    });
    expect(doc.value.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  test("surfaces core schema rejection when the group factory creates invalid JSON", () => {
    const doc = createBoard();
    const invalidAdapter: GroupingAdapter = {
      ...groupingAdapter,
      createGroup() {
        return {
          id: "bad",
          kind: "group",
          title: "Missing children",
        };
      },
    };

    expect(canGroupSelection(doc, invalidAdapter, ["/nodes/0", "/nodes/1"])).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(doc.value.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
