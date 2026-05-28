import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canDrop,
  createDropIntent,
  performDrop,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  cards: z.array(Card),
  archive: z.array(Card),
});

function createDoc() {
  return createJSONDocument(Schema, {
    cards: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
      { id: "c", title: "C", done: false },
    ],
    archive: [],
  });
}

describe("@zod-crud/drop-intent", () => {
  test("plans an internal move drop without mutating", () => {
    const doc = createDoc();
    const drop = createDropIntent(doc);

    expect(drop.canDrop({
      source: { kind: "move", pointer: "/cards/0" },
      target: { after: "/cards/1" },
    })).toEqual({
      ok: true,
      kind: "move",
      target: "/cards/1",
      capability: { ok: true },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
  });

  test("performs an internal move drop", () => {
    const doc = createDoc();

    expect(performDrop(doc, {
      source: { kind: "move", pointer: "/cards/0" },
      target: { after: "/cards/1" },
    })).toMatchObject({
      ok: true,
      kind: "move",
      target: "/cards/1",
      result: { ok: true },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);
  });

  test("performs a payload drop through direct payload paste", () => {
    const doc = createDoc();
    const drop = createDropIntent(doc);

    expect(drop.canDrop({
      source: { kind: "payload", value: { id: "d", title: "D", done: true } },
      target: "/archive/-",
    })).toMatchObject({
      ok: true,
      kind: "payload",
      target: "/archive/-",
      capability: { ok: true },
    });
    expect(drop.perform({
      source: { kind: "payload", value: { id: "d", title: "D", done: true } },
      target: "/archive/-",
    })).toMatchObject({
      ok: true,
      kind: "payload",
      target: "/archive/-",
    });
    expect(doc.value.archive).toEqual([
      { id: "d", title: "D", done: true },
    ]);
  });

  test("supports before and replace payload targets", () => {
    const doc = createDoc();
    const drop = createDropIntent(doc);

    expect(drop.perform({
      source: { kind: "payload", value: { id: "x", title: "X", done: false } },
      target: { before: "/cards/1" },
    })).toMatchObject({ ok: true });
    expect(drop.perform({
      source: { kind: "payload", value: { id: "z", title: "Z", done: true } },
      target: { replace: "/cards/0" },
    })).toMatchObject({ ok: true });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["z", "x", "b", "c"]);
  });

  test("preserves disabled reasons from move and paste capabilities", () => {
    const doc = createDoc();

    expect(canDrop(doc, {
      source: { kind: "move", pointer: "/missing" },
      target: "/archive/-",
    })).toMatchObject({
      ok: true,
      capability: {
        ok: false,
        code: "path_not_found",
      },
    });
    expect(performDrop(doc, {
      source: { kind: "payload", value: { id: "bad", title: "Bad", done: "no" } },
      target: "/archive/-",
    })).toMatchObject({
      ok: false,
      code: "disabled",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.archive).toEqual([]);
  });

  test("rejects unsupported move replace target and invalid after target", () => {
    const doc = createDoc();
    const drop = createDropIntent(doc);

    expect(drop.canDrop({
      source: { kind: "move", pointer: "/cards/0" },
      target: { replace: "/cards/1" },
    })).toEqual({
      ok: false,
      code: "unsupported_target",
      reason: "move drops do not support replace targets",
      pointer: "/cards/1",
    });
    expect(drop.canDrop({
      source: { kind: "move", pointer: "/cards/0" },
      target: { after: "/archive" },
    })).toEqual({
      ok: false,
      code: "invalid_target",
      reason: "relative target must address an array item: /archive",
      pointer: "/archive",
    });
  });
});
