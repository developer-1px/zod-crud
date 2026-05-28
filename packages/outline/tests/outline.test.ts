import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canDemoteOutline,
  canPromoteOutline,
  createOutline,
  demoteOutline,
  promoteOutline,
  readOutline,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Board = z.object({
  title: z.string(),
  lists: z.array(z.object({
    id: z.string(),
    title: z.string(),
    cards: z.array(Card),
  })),
  meta: z.record(z.string(), z.string()),
});

const OutlineItem: z.ZodType<OutlineItem> = z.lazy(() => z.object({
  text: z.string(),
  children: z.array(OutlineItem),
}));
interface OutlineItem {
  text: string;
  children: OutlineItem[];
}

function createBoard() {
  return createJSONDocument(Board, {
    title: "Board",
    lists: [
      {
        id: "todo",
        title: "Todo",
        cards: [
          { id: "a", title: "A", done: false },
          { id: "b", title: "B", done: true },
        ],
      },
    ],
    meta: {
      owner: "editor",
    },
  });
}

function createRows() {
  return createJSONDocument(OutlineItem, {
    text: "root",
    children: [
      { text: "A", children: [] },
      { text: "B", children: [] },
      {
        text: "C",
        children: [
          { text: "C1", children: [] },
          { text: "C2", children: [] },
        ],
      },
      { text: "D", children: [] },
    ],
  });
}

function rows(doc: ReturnType<typeof createRows>): unknown {
  return doc.value;
}

describe("@zod-crud/outline tree", () => {
  test("builds a pointer-first tree and preorder flat list", () => {
    const outline = readOutline(createBoard());

    expect(outline).toMatchObject({
      ok: true,
      root: {
        key: "",
        path: "",
        depth: 0,
        entryKind: "root",
        schemaKind: "object",
        childCount: 3,
        expandable: true,
      },
    });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.root.children?.map((node) => node.path)).toEqual([
      "/title",
      "/lists",
      "/meta",
    ]);
    expect(outline.nodes.map((node) => node.path)).toEqual([
      "",
      "/title",
      "/lists",
      "/lists/0",
      "/lists/0/id",
      "/lists/0/title",
      "/lists/0/cards",
      "/lists/0/cards/0",
      "/lists/0/cards/0/id",
      "/lists/0/cards/0/title",
      "/lists/0/cards/0/done",
      "/lists/0/cards/1",
      "/lists/0/cards/1/id",
      "/lists/0/cards/1/title",
      "/lists/0/cards/1/done",
      "/meta",
      "/meta/owner",
    ]);
  });

  test("creates a facade with tree reads", () => {
    const outline = createOutline(createBoard()).tree("/lists/0/cards", { maxDepth: 1 });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.nodes.map((node) => node.path)).toEqual([
      "/lists/0/cards",
      "/lists/0/cards/0",
      "/lists/0/cards/1",
    ]);
  });

  test("optionally includes isolated JSON value snapshots", () => {
    const doc = createBoard();
    const outline = readOutline(doc, "/lists/0/cards/0", { includeValues: true });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.root.value).toEqual({ id: "a", title: "A", done: false });
    (outline.root.value as { title: string }).title = "mutated";

    expect(doc.value.lists[0]?.cards[0]?.title).toBe("A");
    expect(readOutline(doc, "/lists/0/cards/0", { includeValues: true })).toMatchObject({
      ok: true,
      root: {
        value: { id: "a", title: "A", done: false },
      },
    });
  });
});

describe("@zod-crud/outline structure", () => {
  test("demotes one row under its previous sibling", () => {
    const doc = createRows();

    expect(canDemoteOutline(doc, "/children/1")).toMatchObject({
      ok: true,
      operation: "demote",
      operations: [{ op: "move", from: "/children/1", path: "/children/0/children/-" }],
    });
    expect(demoteOutline(doc, "/children/1")).toMatchObject({
      ok: true,
      result: { ok: true },
    });
    expect(rows(doc)).toEqual({
      text: "root",
      children: [
        { text: "A", children: [{ text: "B", children: [] }] },
        {
          text: "C",
          children: [
            { text: "C1", children: [] },
            { text: "C2", children: [] },
          ],
        },
        { text: "D", children: [] },
      ],
    });
  });

  test("demotes multiple rows under the same previous sibling", () => {
    const doc = createRows();

    expect(createOutline(doc).demote(["/children/1", "/children/2"])).toMatchObject({ ok: true });
    expect(doc.value.children[0]).toEqual({
      text: "A",
      children: [
        { text: "B", children: [] },
        {
          text: "C",
          children: [
            { text: "C1", children: [] },
            { text: "C2", children: [] },
          ],
        },
      ],
    });
    expect(doc.value.children.map((item) => item.text)).toEqual(["A", "D"]);
  });

  test("promotes a nested row and preserves trailing siblings", () => {
    const doc = createRows();

    expect(canPromoteOutline(doc, "/children/2/children/0")).toMatchObject({
      ok: true,
      operation: "promote",
      operations: [
        { op: "move", from: "/children/2/children/0", path: "/children/3" },
        { op: "move", from: "/children/2/children/0", path: "/children/3/children/-" },
      ],
    });
    expect(promoteOutline(doc, "/children/2/children/0")).toMatchObject({ ok: true });
    expect(doc.value.children.map((item) => item.text)).toEqual(["A", "B", "C", "C1", "D"]);
    expect(doc.value.children[2]).toEqual({ text: "C", children: [] });
    expect(doc.value.children[3]).toEqual({
      text: "C1",
      children: [{ text: "C2", children: [] }],
    });
  });

  test("rejects invalid outline movements without mutation", () => {
    const doc = createRows();
    const outline = createOutline(doc);

    expect(outline.canDemote("/children/0")).toMatchObject({
      ok: false,
      code: "path_not_found",
      reason: "no previous sibling for outline item",
    });
    expect(outline.canPromote("/children/0")).toMatchObject({
      ok: false,
      code: "path_not_found",
      reason: "outline item is already top-level",
    });
    expect(outline.canDemote("/text")).toMatchObject({
      ok: false,
      code: "not_outline_item",
    });
    expect(rows(doc)).toEqual(createRows().value);
  });
});
