import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  canInsertSnippet,
  createSnippets,
  insertSnippet,
  type Snippet,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Board = z.object({
  cards: z.array(Card),
}).superRefine((board, ctx) => {
  const seen = new Set<string>();
  for (const [index, card] of board.cards.entries()) {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      continue;
    }
    ctx.addIssue({
      code: "custom",
      path: ["cards", index, "id"],
      message: "duplicate card id",
    });
  }
});

function createBoard() {
  return createJSONDocument(Board, {
    cards: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
    ],
  });
}

const cardSnippet: Snippet = {
  id: "todo-card",
  label: "Todo card",
  payload: { id: "a", title: "From snippet", done: false },
};

describe("@interactive-os/json-document-snippets", () => {
  test("lists snippets without exposing the stored payload", () => {
    const snippets = createSnippets(createBoard(), [cardSnippet]);

    expect(snippets.list()).toEqual([
      { id: "todo-card", label: "Todo card" },
    ]);

    const copy = snippets.get("todo-card");
    expect(copy).toMatchObject(cardSnippet);
    if (copy !== null) {
      (copy.payload as { title: string }).title = "Mutated outside";
    }
    expect(snippets.get("todo-card")).toMatchObject(cardSnippet);
  });

  test("plans and inserts a snippet through direct payload paste", () => {
    const doc = createBoard();
    const snippets = createSnippets(doc, [cardSnippet]);

    expect(snippets.canInsert("todo-card", "/cards/-", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toEqual({
      ok: true,
      id: "todo-card",
      target: "/cards/-",
      capability: { ok: true },
    });
    expect(snippets.insert("todo-card", "/cards/-", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      id: "todo-card",
      target: "/cards/-",
      result: { ok: true },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b", "a-copy"]);
    expect(doc.value.cards[2]?.title).toBe("From snippet");
  });

  test("preserves disabled reasons when a snippet does not fit the schema", () => {
    const doc = createBoard();
    const snippets = createSnippets(doc, [cardSnippet]);

    expect(snippets.canInsert("todo-card", "/cards/-")).toMatchObject({
      ok: false,
      code: "disabled",
      id: "todo-card",
      capability: {
        ok: false,
        code: "schema_violation",
        violations: [{ path: "/cards/2/id", message: "duplicate card id" }],
      },
    });
    expect(snippets.insert("todo-card", "/cards/-")).toMatchObject({
      ok: false,
      code: "disabled",
      id: "todo-card",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  test("reports unknown snippets without touching the document", () => {
    const doc = createBoard();
    const snippets = createSnippets(doc, [cardSnippet]);

    expect(snippets.canInsert("missing", "/cards/-")).toEqual({
      ok: false,
      code: "snippet_not_found",
      reason: "snippet not found: missing",
      id: "missing",
    });
    expect(snippets.insert("missing", "/cards/-")).toMatchObject({
      ok: false,
      code: "snippet_not_found",
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  test("supports standalone snippet insertion helpers", () => {
    const doc = createBoard();

    expect(canInsertSnippet(doc, cardSnippet, { after: "/cards/0" }, {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      capability: { ok: true },
    });
    expect(insertSnippet(doc, cardSnippet, { after: "/cards/0" }, {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      target: { after: "/cards/0" },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "a-copy", "b"]);
  });
});
