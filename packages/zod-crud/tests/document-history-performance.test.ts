import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

describe("doc.history performance contract", () => {
  test("large history depth preserves undo and redo order", () => {
    const Schema = z.object({
      value: z.number(),
    });
    const depth = 1000;
    const doc = createJSONDocument(Schema, { value: 0 }, { history: depth });

    for (let index = 1; index <= depth; index += 1) {
      expect(doc.patch({ op: "replace", path: "/value", value: index })).toEqual({ ok: true });
    }
    expect(doc.value.value).toBe(depth);
    expect(doc.history.undoDepth).toBe(depth);

    for (let index = depth - 1; index >= 0; index -= 1) {
      expect(doc.history.undo()).toBe(true);
      expect(doc.value.value).toBe(index);
    }
    expect(doc.history.undoDepth).toBe(0);
    expect(doc.history.redoDepth).toBe(depth);

    for (let index = 1; index <= depth; index += 1) {
      expect(doc.history.redo()).toBe(true);
      expect(doc.value.value).toBe(index);
    }
    expect(doc.history.redoDepth).toBe(0);
  });

  test("capped history drops old entries without changing latest undo order", () => {
    const Schema = z.object({
      value: z.number(),
    });
    const limit = 32;
    const edits = 128;
    const doc = createJSONDocument(Schema, { value: 0 }, { history: limit });

    for (let index = 1; index <= edits; index += 1) {
      expect(doc.patch({ op: "replace", path: "/value", value: index })).toEqual({ ok: true });
    }

    expect(doc.history.undoDepth).toBe(limit);
    for (let index = edits - 1; index >= edits - limit; index -= 1) {
      expect(doc.history.undo()).toBe(true);
      expect(doc.value.value).toBe(index);
    }
    expect(doc.history.undo()).toBe(false);
    expect(doc.value.value).toBe(edits - limit);

    for (let index = edits - limit + 1; index <= edits; index += 1) {
      expect(doc.history.redo()).toBe(true);
      expect(doc.value.value).toBe(index);
    }
  });

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

  test("root object replace history keeps __proto__ as data", () => {
    const initial: Record<string, unknown> = { a: 1, b: 2 };
    Object.defineProperty(initial, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const doc = createJSONDocument(z.any(), initial, { history: 10 });

    expect(doc.patch([
      { op: "replace", path: "/a", value: 10 },
      { op: "replace", path: "/__proto__", value: { safe: false } },
    ])).toEqual({ ok: true });
    expect(doc.history.undo()).toBe(true);
    expect((doc.value as Record<string, unknown>).a).toBe(1);
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(doc.value as object, "__proto__")).toBe(true);
    expect((doc.value as Record<string, unknown>).__proto__).toEqual({ safe: true });

    expect(doc.history.redo()).toBe(true);
    expect((doc.value as Record<string, unknown>).a).toBe(10);
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(doc.value as object, "__proto__")).toBe(true);
    expect((doc.value as Record<string, unknown>).__proto__).toEqual({ safe: false });
  });

  test("root object replace history preserves repeated key semantics", () => {
    const Schema = z.object({
      a: z.number(),
      b: z.number(),
    });
    const initial = { a: 1, b: 2 };
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch([
      { op: "replace", path: "/a", value: 10 },
      { op: "replace", path: "/a", value: 20 },
      { op: "replace", path: "/b", value: 30 },
    ])).toEqual({ ok: true });
    expect(doc.value).toEqual({ a: 20, b: 30 });

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value).toEqual({ a: 20, b: 30 });
  });

  test("same-array field replace batch history restores without schema validation", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ title: z.string(), done: z.boolean() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = {
      items: [
        { title: "a", done: false },
        { title: "b", done: false },
        { title: "c", done: false },
      ],
    };
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch([
      { op: "replace", path: "/items/0/done", value: true },
      { op: "replace", path: "/items/1/done", value: true },
    ])).toEqual({ ok: true });
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.done)).toEqual([true, true, false]);
    expect(validations).toBe(validationsAfterPatch);
  });

  test("same-array field replace history handles unordered indexes", () => {
    const Schema = z.object({
      items: z.array(z.object({ title: z.string(), done: z.boolean() })),
    });
    const initial = {
      items: [
        { title: "a", done: false },
        { title: "b", done: false },
        { title: "c", done: false },
      ],
    };
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch([
      { op: "replace", path: "/items/2/done", value: true },
      { op: "replace", path: "/items/0/done", value: true },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.done)).toEqual([true, false, true]);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.done)).toEqual([true, false, true]);
  });

  test("same-array field replace batch history handles escaped field names", () => {
    const Schema = z.object({
      items: z.array(z.object({ "d/one": z.boolean() })),
    });
    const initial = {
      items: [
        { "d/one": false },
        { "d/one": false },
      ],
    };
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch([
      { op: "replace", path: "/items/0/d~1one", value: true },
      { op: "replace", path: "/items/1/d~1one", value: true },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item["d/one"])).toEqual([true, true]);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item["d/one"])).toEqual([true, true]);
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

  test("same-array field replace batches keep the public JSON guard", () => {
    const Schema = z.object({
      items: z.array(z.object({ value: z.unknown() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ value: 1 }, { value: 2 }],
    }, { strict: false });

    const result = doc.patch([
      { op: "replace", path: "/items/0/value", value: 3 },
      { op: "replace", path: "/items/1/value", value: () => "bad" },
    ]);

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [{ value: 1 }, { value: 2 }] });
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

  test("document clipboard capability checks keep the JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    expect(doc.canCopy("/items/0")).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.canCut("/items/0")).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.hasData).toBe(false);
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("document clipboard copy keeps the JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    const result = doc.clipboard.copy("/items/0");

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.hasData).toBe(false);
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("default documents do not keep hidden selection targets after patches", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ id: "a" }],
    }, { strict: false });

    expect(doc.selection).toBeUndefined();
    expect(doc.patch({ op: "add", path: "/items/-", value: { id: "b" } })).toEqual({ ok: true });
    expect(doc.clipboard.copy()).toMatchObject({ ok: false, code: "empty_selection" });

    expect(doc.clipboard.write({ id: "c" })).toEqual({ ok: true });
    expect(doc.clipboard.paste()).toMatchObject({ ok: false, code: "empty_selection" });
  });

  test("document clipboard cut keeps the JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    const result = doc.clipboard.cut("/items/0");

    expect(result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.hasData).toBe(false);
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("document cut checks and clipboard cut use trusted preview on plain structural schemas", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ id: "a" }, { id: "b" }, { id: "c" }],
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.canCut("/items/0")).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(doc.clipboard.hasData).toBe(false);

    expect(doc.clipboard.cut("/items/0")).toMatchObject({
      ok: true,
      payload: { id: "a" },
      applied: [{ op: "remove", path: "/items/0" }],
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "c"]);
    expect(rootParses).toBe(0);
  });

  test("document paste checks and clipboard paste use trusted preview on plain structural schemas", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ id: "a" }, { id: "b" }],
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.canPastePayload("/items/-", { id: "c" })).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);

    expect(doc.clipboard.pastePayload("/items/-", { id: "c" })).toMatchObject({
      ok: true,
      applied: [{ op: "add", path: "/items/2", value: { id: "c" } }],
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(rootParses).toBe(0);

    expect(doc.clipboard.copy("/items")).toMatchObject({ ok: true });
    expect(doc.canPaste({ replace: "/items" })).toEqual({ ok: true });
    expect(doc.clipboard.paste({ replace: "/items" })).toMatchObject({
      ok: true,
      applied: [{ op: "replace", path: "/items", value: doc.value.items }],
    });
    expect(rootParses).toBe(0);

    expect(doc.clipboard.write([{ id: 1 }], { source: "/items" })).toEqual({ ok: true });
    expect(doc.canPaste({ replace: "/items" })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
  });

  test("document paste checks keep the JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad] }, { strict: false });

    expect(doc.canPastePayload("/items/-", 1)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.pastePayload("/items/-", 1)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [bad] });
  });

  test("document pastePayload rekey keeps the JSON guard for external payloads", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const badPayload = { id: "a", run: () => "bad" };
    const doc = createJSONDocument(Schema, { items: [] }, { strict: false });
    const rekey = { fields: ["id"], strategy: "suffix" as const };

    expect(doc.canPastePayload("/items/-", badPayload, { rekey })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(doc.clipboard.pastePayload("/items/-", badPayload, { rekey })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(doc.value).toEqual({ items: [] });
  });

  test("document duplicate, move, and JSONPath replace checks use trusted preview on plain structural schemas", () => {
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [{ id: "a" }, { id: "b" }, { id: "c" }],
    }, { history: 10, strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.canDuplicate("/items/0")).toEqual({ ok: true });
    expect(doc.duplicate("/items/0")).toMatchObject({
      ok: true,
      duplicatedTo: "/items/1",
      applied: [{ op: "copy", from: "/items/0", path: "/items/1" }],
    });
    expect(doc.canMove("/items/1", "/items/3")).toEqual({ ok: true });
    expect(doc.canReplace("$.items[0].id", "z")).toEqual({ ok: true });

    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a", "b", "c"]);
    expect(doc.history.undoDepth).toBe(1);
    expect(rootParses).toBe(0);
  });

  test("document duplicate, move, and JSONPath replace keep the JSON guard for untrusted schema output", () => {
    const Schema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const doc = createJSONDocument(Schema, { items: [bad, 1] }, { strict: false });

    expect(doc.canDuplicate("/items/0")).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.canMove("/items/1", "/items/0")).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.canReplace("$.items[1]", 2)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.duplicate("/items/0")).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toEqual({ items: [bad, 1] });
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

  test("plain structural root object replace batches validate locally", () => {
    const Value = z.object({
      id: z.string(),
      done: z.boolean(),
    });
    const Schema = z.record(z.string(), Value);
    const doc = createJSONDocument(Schema, {
      a: { id: "a", done: false },
      b: { id: "b", done: false },
      c: { id: "c", done: false },
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;
    const originalValueSafeParse = Value.safeParse.bind(Value);
    let valueParses = 0;
    Value.safeParse = ((value: unknown) => {
      valueParses += 1;
      return originalValueSafeParse(value);
    }) as typeof Value.safeParse;

    expect(doc.patch([
      { op: "replace", path: "/a", value: { id: "a2", done: true } },
      { op: "replace", path: "/b", value: { id: "b2", done: true } },
    ])).toEqual({ ok: true });
    expect(doc.value).toEqual({
      a: { id: "a2", done: true },
      b: { id: "b2", done: true },
      c: { id: "c", done: false },
    });
    expect(rootParses).toBe(0);
    expect(valueParses).toBe(0);

    const before = doc.value;
    const rejected = doc.patch([
      { op: "replace", path: "/a", value: { id: "a3", done: false } },
      { op: "replace", path: "/b", value: { id: 1, done: true } },
    ]);
    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value).toBe(before);
    expect(rootParses).toBe(0);
    expect(valueParses).toBe(1);

    const accessorValue: Record<string, unknown> = { done: true };
    Object.defineProperty(accessorValue, "id", {
      enumerable: true,
      get: () => "b3",
    });
    const nonSerializable = doc.patch([
      { op: "replace", path: "/a", value: { id: "a4", done: false } },
      { op: "replace", path: "/b", value: accessorValue },
    ]);
    expect(nonSerializable).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.value).toBe(before);
    expect(rootParses).toBe(0);
    expect(valueParses).toBe(1);
  });

  test("plain structural same-array field replace batches reuse local field validation", () => {
    const Schema = z.object({
      items: z.array(z.object({ done: z.boolean(), title: z.string() })),
    });
    const doc = createJSONDocument(Schema, {
      items: [
        { done: false, title: "a" },
        { done: false, title: "b" },
        { done: false, title: "c" },
      ],
    }, { strict: false });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    expect(doc.patch([
      { op: "replace", path: "/items/0/done", value: true },
      { op: "replace", path: "/items/1/done", value: true },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.done)).toEqual([true, true, false]);
    expect(rootParses).toBe(0);

    expect(doc.patch([
      { op: "replace", path: "/items/2/done", value: true },
      { op: "replace", path: "/items/0/done", value: false },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.done)).toEqual([false, true, true]);
    expect(rootParses).toBe(0);

    const before = doc.value;
    const rejected = doc.patch([
      { op: "replace", path: "/items/0/done", value: false },
      { op: "replace", path: "/items/2/done", value: "bad" },
    ]);
    expect(rejected).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.value).toBe(before);
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

  test("same-array copy and move batches validate locally", () => {
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
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "move", from: "/items/2", path: "/items/0" },
      { op: "remove", path: "/items/3" },
      { op: "add", path: "/items/-", value: { id: "d", done: false } },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a", "a", "d"]);
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

  test("append-only add batch history restores in order without schema validation", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = { items: [{ id: "a" }, { id: "b" }] };
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch([
      { op: "add", path: "/items/-", value: { id: "c" } },
      { op: "add", path: "/items/-", value: { id: "d" } },
      { op: "add", path: "/items/-", value: { id: "e" } },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(validations).toBe(validationsAfterPatch);
  });

  test("single same-array history restores without schema validation", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ id: z.string() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = { items: [{ id: "a" }, { id: "b" }] };
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch({ op: "add", path: "/items/-", value: { id: "c" } })).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterAdd = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterAdd);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(validations).toBe(validationsAfterAdd);
  });

  test("same-array copy/move batch history restores without schema validation", () => {
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
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "remove", path: "/items/2" },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a", "c"]);
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a", "c"]);
    expect(validations).toBe(validationsAfterPatch);
  });

  test("same-array copy/move batch history without removes restores without schema validation", () => {
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
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "move", from: "/items/2", path: "/items/0" },
    ])).toEqual({ ok: true });
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a", "a", "c"]);
    expect(validations).toBe(validationsAfterCreate + 1);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["b", "a", "a", "c"]);
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
