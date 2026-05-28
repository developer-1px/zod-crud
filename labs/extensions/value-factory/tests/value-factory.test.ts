import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canCreateValue,
  createValueFactory,
  type ValueFactoryCreate,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  cards: z.array(Card),
  title: z.string(),
});
type CardValue = z.output<typeof Card>;

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Board",
    cards: [
      { id: "a", title: "A", done: false },
    ],
  });
}

const createCard: ValueFactoryCreate<CardValue> = (context) => {
  if (context.path !== "/cards/-") return undefined;
  expect(context.mode).toBe("insert");
  expect(context.kind).toBe("object");
  return { id: "b", title: "B", done: false };
};

describe("@zod-crud/value-factory", () => {
  test("creates a schema-checked value without mutating", () => {
    const doc = createDoc();

    const result = canCreateValue(doc, "/cards/-", createCard);

    expect(result).toMatchObject({
      ok: true,
      path: "/cards/-",
      mode: "insert",
      kind: "object",
      value: { id: "b", title: "B", done: false },
    });
    expect(doc.value.cards).toHaveLength(1);
  });

  test("preflights and inserts a factory value", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, createCard);

    expect(values.canInsert("/cards/-")).toMatchObject({
      ok: true,
      value: { id: "b", title: "B", done: false },
    });
    expect(values.insert("/cards/-")).toMatchObject({
      ok: true,
      value: { id: "b", title: "B", done: false },
    });
    expect(doc.value.cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  test("reports missing factories", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, createCard);

    expect(values.canCreate("/title", { mode: "value" })).toMatchObject({
      ok: false,
      code: "factory_miss",
      pointer: "/title",
    });
  });

  test("reports schema path failures", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, createCard);

    expect(values.canCreate("/missing/-")).toMatchObject({
      ok: false,
      code: "schema_path_failed",
      pointer: "/missing/-",
    });
  });

  test("reports thrown factory errors", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, () => {
      throw new Error("id source unavailable");
    });

    expect(values.canCreate("/cards/-")).toMatchObject({
      ok: false,
      code: "factory_failed",
      reason: "id source unavailable",
      pointer: "/cards/-",
    });
  });

  test("reports values rejected by the target schema", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, () => ({
      id: "b",
      title: "B",
      done: "no",
    }));

    expect(values.canInsert("/cards/-")).toMatchObject({
      ok: false,
      code: "value_rejected",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.cards).toHaveLength(1);
  });

  test("supports value-mode creation for replacements", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, (context) => {
      if (context.path === "/title" && context.mode === "value") return "Next";
      return undefined;
    });

    expect(values.create("/title", { mode: "value" })).toMatchObject({
      ok: true,
      path: "/title",
      mode: "value",
      kind: "string",
      value: "Next",
    });
    expect(doc.value.title).toBe("Board");
  });

  test("returns isolated created values", () => {
    const doc = createDoc();
    const values = createValueFactory(doc, createCard);

    const created = values.create("/cards/-");
    if (!created.ok) throw new Error(created.reason);

    created.value.title = "Changed";

    expect(values.create("/cards/-")).toMatchObject({
      ok: true,
      value: { id: "b", title: "B", done: false },
    });
    expect(doc.value.cards).toEqual([
      { id: "a", title: "A", done: false },
    ]);
  });
});
