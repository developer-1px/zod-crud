import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  canPasteSpecial,
  createPasteSpecial,
  pasteSpecial,
  type PasteSpecialAdapter,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  kind: z.literal("card"),
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
      { id: "a", kind: "card", title: "Alpha", done: false },
      { id: "b", kind: "card", title: "Beta", done: true },
    ],
  });
}

const adapter: PasteSpecialAdapter = {
  adapt({ payload }) {
    if (Array.isArray(payload)) {
      return {
        ok: true,
        payload: payload.map(toCardPayload),
        options: {
          spread: true,
          rekey: { fields: ["id"], strategy: "suffix" },
        },
        diagnostics: [{ code: "external_payload", reason: "converted external card array" }],
      };
    }

    if (isExternalCard(payload)) {
      return {
        ok: true,
        payload: toCardPayload(payload),
        options: {
          rekey: { fields: ["id"], strategy: "suffix" },
        },
        diagnostics: [{ code: "external_payload", reason: "converted external card" }],
      };
    }

    return {
      ok: false,
      code: "unsupported_payload",
      reason: "external card payload expected",
    };
  },
};

describe("@interactive-os/json-document-paste-special", () => {
  test("adapts and pastes an external payload with core rekeying", () => {
    const doc = createBoard();
    const paste = createPasteSpecial(doc, adapter);
    const input = {
      payload: { type: "external.card", id: "a", name: "Imported" },
      target: "/cards/-",
    };

    expect(paste.canPaste(input)).toMatchObject({
      ok: true,
      target: "/cards/-",
      payload: { id: "a", kind: "card", title: "Imported", done: false },
      options: { rekey: { fields: ["id"], strategy: "suffix" } },
      capability: { ok: true },
      diagnostics: [{ code: "external_payload" }],
    });

    expect(paste.paste(input)).toMatchObject({
      ok: true,
      result: { ok: true },
      diagnostics: [{ code: "external_payload" }],
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b", "a-copy"]);
    expect(doc.value.cards[2]).toMatchObject({
      id: "a-copy",
      kind: "card",
      title: "Imported",
    });
  });

  test("adapts array payloads to spread paste with ID remapping", () => {
    const doc = createBoard();

    expect(pasteSpecial(doc, adapter, {
      payload: [
        { type: "external.card", id: "a", name: "One" },
        { type: "external.card", id: "b", name: "Two" },
      ],
      target: { after: "/cards/0" },
    })).toMatchObject({
      ok: true,
      options: {
        spread: true,
        rekey: { fields: ["id"], strategy: "suffix" },
      },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "a-copy", "b-copy", "b"]);
    expect(doc.value.cards.map((card) => card.title)).toEqual(["Alpha", "One", "Two", "Beta"]);
  });

  test("keeps unsupported payload diagnostics out of core paste", () => {
    const doc = createBoard();
    const paste = createPasteSpecial(doc, adapter);

    expect(paste.canPaste({
      payload: { type: "note", text: "Wrong" },
      target: "/cards/-",
    })).toEqual({
      ok: false,
      code: "unsupported_payload",
      reason: "external card payload expected",
      target: "/cards/-",
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  test("reports adapter exceptions as structured errors", () => {
    const doc = createBoard();
    const throwingAdapter: PasteSpecialAdapter = {
      adapt() {
        throw new Error("adapter boom");
      },
    };

    expect(canPasteSpecial(doc, throwingAdapter, {
      payload: { type: "external.card", id: "c", name: "Crash" },
      target: "/cards/-",
    })).toEqual({
      ok: false,
      code: "adapter_failed",
      reason: "adapter boom",
      target: "/cards/-",
    });
  });

  test("preserves core schema rejection when adapted payload still does not fit", () => {
    const doc = createBoard();
    const noRekeyAdapter: PasteSpecialAdapter = {
      adapt({ payload }) {
        if (!isExternalCard(payload)) {
          return { ok: false, code: "unsupported_payload", reason: "external card payload expected" };
        }
        return {
          ok: true,
          payload: toCardPayload(payload),
        };
      },
    };

    expect(canPasteSpecial(doc, noRekeyAdapter, {
      payload: { type: "external.card", id: "a", name: "Duplicate" },
      target: "/cards/-",
    })).toMatchObject({
      ok: true,
      capability: {
        ok: false,
        code: "schema_violation",
        violations: [{ path: "/cards/2/id", message: "duplicate card id" }],
      },
    });
    expect(pasteSpecial(doc, noRekeyAdapter, {
      payload: { type: "external.card", id: "a", name: "Duplicate" },
      target: "/cards/-",
    })).toMatchObject({
      ok: false,
      code: "disabled",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b"]);
  });
});

function isExternalCard(value: unknown): value is { type: "external.card"; id: string; name: string } {
  return typeof value === "object"
    && value !== null
    && (value as { type?: unknown }).type === "external.card"
    && typeof (value as { id?: unknown }).id === "string"
    && typeof (value as { name?: unknown }).name === "string";
}

function toCardPayload(value: unknown) {
  if (!isExternalCard(value)) throw new Error("external card payload expected");
  return {
    id: value.id,
    kind: "card" as const,
    title: value.name,
    done: false,
  };
}
