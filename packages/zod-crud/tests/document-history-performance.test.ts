import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

describe("doc.history performance contract", () => {
  test("undo and redo replay trusted history without revalidating the whole schema", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ title: z.string(), done: z.boolean() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = {
      items: Array.from({ length: 100 }, (_, index) => ({
        title: `item ${index}`,
        done: false,
      })),
    };

    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch({ op: "replace", path: "/items/50/done", value: true })).toEqual({ ok: true });
    expect(validations).toBeGreaterThan(validationsAfterCreate);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.items[50]?.done).toBe(false);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items[50]?.done).toBe(true);
    expect(validations).toBe(validationsAfterPatch);
  });

  test("batch replace undo preserves repeated and nested path semantics", () => {
    const Schema = z.object({
      items: z.array(z.object({ title: z.string(), done: z.boolean() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [
        { title: "a", done: false },
        { title: "b", done: false },
      ],
    }, { history: 10 });

    expect(doc.patch([
      { op: "replace", path: "/items/0/title", value: "a1" },
      { op: "replace", path: "/items/0/title", value: "a2" },
      { op: "replace", path: "/items/1", value: { title: "b1", done: true } },
      { op: "replace", path: "/items/1/done", value: false },
    ])).toEqual({ ok: true });
    expect(doc.value).toEqual({
      items: [
        { title: "a2", done: false },
        { title: "b1", done: false },
      ],
    });

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual({
      items: [
        { title: "a", done: false },
        { title: "b", done: false },
      ],
    });
  });

  test("commit with explicit selection validates once and replays the accepted patch", () => {
    let validations = 0;
    const Schema = z.object({
      title: z.string(),
    }).superRefine(() => {
      validations += 1;
    });
    const doc = createJSONDocument(Schema, { title: "draft" }, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/title", offset: 0 },
          focus: { path: "/title", offset: 0 },
        }],
      },
    });
    const validationsAfterCreate = validations;

    const planned = doc.selection?.textPatch("A");
    expect(planned).toMatchObject({ ok: true });
    if (!planned?.ok) return;

    expect(doc.commit(planned.patch, { selection: planned.selection })).toEqual({ ok: true });
    expect(doc.value.title).toBe("Adraft");
    expect(validations).toBe(validationsAfterCreate + 1);
    expect(doc.history.undo()).toBe(true);
    expect(doc.value.title).toBe("draft");
  });

  test("document patch still rejects non-serializable values on the trusted state path", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const doc = createJSONDocument(Schema, { items: [1] }, { strict: false });

    const result = doc.patch({ op: "replace", path: "/items/0", value: () => "bad" });

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [1] });
  });

  test("document patch keeps the public JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    const result = doc.patch({ op: "add", path: "/items/-", value: 2 });

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("document capability preview keeps the public JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    const result = doc.canPatch({ op: "add", path: "/items/-", value: 2 });

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("plain structural leaf replace validates locally without rerunning root schema parse", () => {
    const Schema = z.object({
      items: z.array(z.object({ done: z.boolean() })),
      settings: z.object({ active: z.string() }),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ done: false }],
      settings: { active: "main" },
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.patch({ op: "replace", path: "/items/0/done", value: true })).toEqual({ ok: true });
    expect(doc.value.items[0]?.done).toBe(true);
    expect(rootParses).toBe(0);

    const rejected = doc.patch({ op: "replace", path: "/items/0/done", value: "bad" });
    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value.items[0]?.done).toBe(true);
    expect(rootParses).toBe(0);
  });

  test("plain structural array mutations validate locally without rerunning root schema parse", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string(), done: z.boolean() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [
        { id: "a", done: false },
        { id: "b", done: true },
      ],
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.patch({ op: "add", path: "/items/-", value: { id: "c", done: false } })).toEqual({ ok: true });
    expect(doc.patch({ op: "copy", from: "/items/0", path: "/items/-" })).toEqual({ ok: true });
    expect(doc.patch({ op: "move", from: "/items/3", path: "/items/1" })).toEqual({ ok: true });
    expect(doc.patch({ op: "remove", path: "/items/0" })).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(rootParses).toBe(0);

    const rejected = doc.patch({ op: "add", path: "/items/-", value: { id: 1, done: false } });
    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(rootParses).toBe(0);
  });

  test("object key removals fall back to full validation", () => {
    const Schema = z.object({ title: z.string() });
    const doc = createJSONDocument(Schema, { title: "draft" }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    const rejected = doc.patch({ op: "remove", path: "/title" });

    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value).toEqual({ title: "draft" });
    expect(rootParses).toBe(1);
  });

  test("mixed plain structural array patches validate locally and stay atomic", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string(), done: z.boolean() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [
        { id: "a", done: false },
        { id: "b", done: true },
        { id: "c", done: false },
      ],
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.patch([
      { op: "add", path: "/items/-", value: { id: "d", done: false } },
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/4", path: "/items/1" },
      { op: "remove", path: "/items/2" },
      { op: "replace", path: "/items/0/done", value: true },
    ])).toEqual({ ok: true });
    expect(doc.value.items).toEqual([
      { id: "a", done: true },
      { id: "a", done: false },
      { id: "c", done: false },
      { id: "d", done: false },
    ]);
    expect(rootParses).toBe(0);

    const before = doc.value;
    const rejected = doc.patch([
      { op: "add", path: "/items/-", value: { id: "e", done: false } },
      { op: "add", path: "/items/-", value: { id: 1, done: false } },
    ]);
    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value).toBe(before);
    expect(rootParses).toBe(0);
  });

  test("same-array batch rejects non-serializable add values atomically", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const doc = createJSONDocument(Schema, { items: [1] }, { strict: false });

    const result = doc.patch([
      { op: "add", path: "/items/-", value: 2 },
      { op: "add", path: "/items/-", value: () => "bad" },
    ]);

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [1] });
  });

  test("same-array add/remove batch history restores without schema validation", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = { items: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch([
      { op: "add", path: "/items/-", value: { id: "d" } },
      { op: "remove", path: "/items/1" },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "c", "d"]);
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "c", "d"]);
    expect(validations).toBe(validationsAfterPatch);
  });

  test("schema checks fall back to full validation for local-looking patches", () => {
    let validations = 0;
    const Schema = z.object({
      min: z.number(),
      max: z.number(),
    }).superRefine((value, context) => {
      validations += 1;
      if (value.min > value.max) {
        context.addIssue({
          code: "custom",
          path: ["min"],
          message: "min must be <= max",
        });
      }
    });
    const doc = createJSONDocument(Schema, { min: 1, max: 5 }, { strict: false });
    const validationsAfterCreate = validations;

    const rejected = doc.patch({ op: "replace", path: "/min", value: 10 });

    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value).toEqual({ min: 1, max: 5 });
    expect(validations).toBe(validationsAfterCreate + 1);
  });
});
