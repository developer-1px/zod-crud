import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createOutline } from "../src/index.js";

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

describe("@zod-crud/outline", () => {
  test("builds a pointer-first tree and preorder flat list", () => {
    const outline = createOutline(createBoard());

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

  test("limits expansion depth while preserving child counts", () => {
    const outline = createOutline(createBoard(), "", { maxDepth: 1 });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.nodes.map((node) => node.path)).toEqual([
      "",
      "/title",
      "/lists",
      "/meta",
    ]);
    expect(outline.root.children?.find((node) => node.path === "/lists")).toMatchObject({
      childCount: 1,
      expandable: true,
    });
    expect(outline.root.children?.find((node) => node.path === "/lists")?.children).toBeUndefined();
  });

  test("can start from a nested pointer", () => {
    const outline = createOutline(createBoard(), "/lists/0/cards", { maxDepth: 1 });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.root).toMatchObject({
      key: "",
      path: "/lists/0/cards",
      entryKind: "array",
      schemaKind: "array",
      childCount: 2,
    });
    expect(outline.nodes.map((node) => node.path)).toEqual([
      "/lists/0/cards",
      "/lists/0/cards/0",
      "/lists/0/cards/1",
    ]);
  });

  test("optionally includes isolated JSON value snapshots", () => {
    const doc = createBoard();
    const outline = createOutline(doc, "/lists/0/cards/0", { includeValues: true });
    if (!outline.ok) throw new Error(outline.reason);

    expect(outline.root.value).toEqual({ id: "a", title: "A", done: false });
    (outline.root.value as { title: string }).title = "mutated";

    expect(doc.value.lists[0]?.cards[0]?.title).toBe("A");
    expect(createOutline(doc, "/lists/0/cards/0", { includeValues: true })).toMatchObject({
      ok: true,
      root: {
        value: { id: "a", title: "A", done: false },
      },
    });
  });

  test("omits values by default for lightweight outline reads", () => {
    const outline = createOutline(createBoard(), "/lists/0/cards/0");
    if (!outline.ok) throw new Error(outline.reason);

    expect("value" in outline.root).toBe(false);
    expect(outline.root.children?.some((node) => "value" in node)).toBe(false);
  });

  test("reports pointer read errors without throwing", () => {
    expect(createOutline(createBoard(), "/missing")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
    expect(createOutline(createBoard(), "not/a/pointer")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "not/a/pointer",
    });
  });
});
