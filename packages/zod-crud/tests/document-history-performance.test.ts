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
});
