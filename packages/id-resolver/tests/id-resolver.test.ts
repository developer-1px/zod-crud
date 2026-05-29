import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createIdResolver } from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
});
const Column = z.object({
  id: z.string(),
  cards: z.array(Card),
});
const Board = z.object({
  columns: z.array(Column),
  blocks: z.array(z.object({
    kind: z.string(),
    id: z.string().optional(),
    text: z.string(),
  })),
});

function createBoard() {
  return createJSONDocument(Board, {
    columns: [
      {
        id: "todo",
        cards: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
      },
      {
        id: "done",
        cards: [
          { id: "c", title: "C" },
        ],
      },
    ],
    blocks: [
      { kind: "heading", id: "intro", text: "Intro" },
      { kind: "paragraph", text: "Body" },
    ],
  });
}

describe("@zod-crud/id-resolver", () => {
  test("resolves a stable id to the current JSON Pointer", () => {
    const doc = createBoard();
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "card",
          query: "$.columns[*].cards[*]",
          readId: (value) => Card.safeParse(value).data?.id,
        },
      ],
    });

    expect(ids.resolve("card", "b")).toEqual({
      ok: true,
      scope: "card",
      id: "b",
      pointer: "/columns/0/cards/1",
    });

    expect(doc.move("/columns/0/cards/1", "/columns/1/cards/-")).toEqual({ ok: true });
    expect(ids.resolve("card", "b")).toEqual({
      ok: true,
      scope: "card",
      id: "b",
      pointer: "/columns/1/cards/1",
    });
  });

  test("supports broad queries by skipping values without an id", () => {
    const doc = createBoard();
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "block",
          query: "$.blocks[*]",
          readId: (value) => {
            const block = Board.shape.blocks.element.safeParse(value);
            return block.data?.id;
          },
        },
      ],
    });

    expect(ids.current()).toEqual({
      entries: [
        {
          scope: "block",
          id: "intro",
          pointer: "/blocks/0",
        },
      ],
      diagnostics: [],
    });
  });

  test("reports duplicate ids and rejects ambiguous resolution", () => {
    const doc = createBoard();
    expect(doc.replace("/columns/1/cards/0/id", "a")).toEqual({ ok: true });
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "card",
          query: "$.columns[*].cards[*]",
          readId: (value) => Card.safeParse(value).data?.id,
        },
      ],
    });

    expect(ids.current().diagnostics).toEqual([
      {
        code: "duplicate_id",
        reason: "id is duplicated in scope card: a",
        scope: "card",
        id: "a",
        pointers: ["/columns/0/cards/0", "/columns/1/cards/0"],
      },
    ]);
    expect(ids.resolve("card", "a")).toEqual({
      ok: false,
      code: "ambiguous_id",
      reason: "id is duplicated in scope card: a",
      scope: "card",
      id: "a",
      pointers: ["/columns/0/cards/0", "/columns/1/cards/0"],
    });
  });

  test("keeps scope names independent", () => {
    const doc = createBoard();
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "column",
          query: "$.columns[*]",
          readId: (value) => Column.safeParse(value).data?.id,
        },
        {
          scope: "card",
          query: "$.columns[*].cards[*]",
          readId: (value) => Card.safeParse(value).data?.id,
        },
      ],
    });

    expect(ids.resolve("column", "todo")).toMatchObject({
      ok: true,
      pointer: "/columns/0",
    });
    expect(ids.resolve("card", "todo")).toMatchObject({
      ok: false,
      code: "id_not_found",
    });
  });

  test("returns structured diagnostics for invalid queries and invalid ids", () => {
    const doc = createBoard();
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "bad-query",
          query: "$..[",
          readId: () => "unused",
        },
        {
          scope: "bad-id",
          query: "$.columns[*]",
          readId: () => "",
        },
        {
          scope: "throws",
          query: "$.blocks[*]",
          readId: () => {
            throw new Error("bad reader");
          },
        },
      ],
    });

    expect(ids.current().diagnostics).toMatchObject([
      {
        code: "invalid_query",
        scope: "bad-query",
      },
      {
        code: "invalid_id",
        reason: "id must be a non-empty string at /columns/0",
        scope: "bad-id",
        pointer: "/columns/0",
      },
      {
        code: "invalid_id",
        reason: "id must be a non-empty string at /columns/1",
        scope: "bad-id",
        pointer: "/columns/1",
      },
      {
        code: "invalid_id",
        reason: "bad reader",
        scope: "throws",
        pointer: "/blocks/0",
      },
      {
        code: "invalid_id",
        reason: "bad reader",
        scope: "throws",
        pointer: "/blocks/1",
      },
    ]);
    expect(ids.resolve("bad-query", "unused")).toMatchObject({
      ok: false,
      code: "invalid_query",
      scope: "bad-query",
      id: "unused",
    });
  });

  test("reports missing scope and id without mutating", () => {
    const doc = createBoard();
    const ids = createIdResolver(doc, {
      scopes: [
        {
          scope: "card",
          query: "$.columns[*].cards[*]",
          readId: (value) => Card.safeParse(value).data?.id,
        },
      ],
    });

    expect(ids.resolve("missing", "a")).toEqual({
      ok: false,
      code: "scope_not_found",
      reason: "scope is not registered: missing",
      scope: "missing",
      id: "a",
    });
    expect(ids.resolve("card", "missing")).toEqual({
      ok: false,
      code: "id_not_found",
      reason: "id not found in scope card: missing",
      scope: "card",
      id: "missing",
    });
    expect(doc.history.undoDepth).toBe(0);
  });
});
