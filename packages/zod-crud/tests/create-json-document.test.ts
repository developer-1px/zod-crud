import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

const Item = z.object({ id: z.string(), name: z.string().min(1) });
const Schema = z.object({
  title: z.string(),
  items: z.array(Item),
  meta: z.record(z.string(), z.string()),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { owner: "core" },
};

describe("createJSONDocument public interface", () => {
  test("exposes only the new document facade namespaces", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "extended", initial: ["/items/0"] },
    });

    expect("ops" in doc).toBe(false);
    expect("commands" in doc).toBe(false);
    expect("check" in doc).toBe(false);
    expect("can" in doc).toBe(false);
    expect(doc.selection?.selectedPointers).toEqual(["/items/0"]);
    expect(doc.history.canUndo).toBe(false);
  });

  test("applies JSON Patch operations and records history", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.patch({ op: "replace", path: "/title", value: "final" })).toEqual({ ok: true });
    expect(doc.patch({ op: "add", path: "/items/-", value: { id: "c", name: "C" } })).toEqual({ ok: true });
    expect(doc.patch({ op: "copy", from: "/items/0", path: "/items/1" })).toEqual({ ok: true });
    expect(doc.patch({ op: "move", from: "/meta/owner", path: "/meta/editor" })).toEqual({ ok: true });

    expect(doc.value).toMatchObject({
      title: "final",
      meta: { editor: "core" },
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a", "b", "c"]);
    expect(doc.history.undoDepth).toBe(4);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.meta).toEqual({ owner: "core" });
    expect(doc.history.redo()).toBe(true);
    expect(doc.value.meta).toEqual({ editor: "core" });
  });

  test("duplicates a sibling through the public document facade", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    const result = doc.duplicate("/items/0", { rekey: { fields: ["id"], strategy: "suffix" } });

    expect(result).toMatchObject({
      ok: true,
      duplicatedTo: "/items/1",
      value: {
        items: [
          { id: "a", name: "A" },
          { id: "a-copy", name: "A" },
          { id: "b", name: "B" },
        ],
      },
      applied: [{ op: "add", path: "/items/1", value: { id: "a-copy", name: "A" } }],
    });
    expect("patch" in result).toBe(false);
    expect("next" in result).toBe(false);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "a-copy", "b"]);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("rekeys suffix duplicates against actual suffix candidates", () => {
    const rekey = { fields: ["id"], strategy: "suffix" as const };
    const unrelatedSuffix = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a", name: "A" },
        { id: "a-copy-x", name: "AX" },
        { id: "b", name: "B" },
      ],
    });
    const realSuffix = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a", name: "A" },
        { id: "a-copy", name: "AC" },
        { id: "b", name: "B" },
      ],
    });

    expect(unrelatedSuffix.duplicate("/items/0", { rekey })).toMatchObject({
      ok: true,
      applied: [{ op: "add", path: "/items/1", value: { id: "a-copy", name: "A" } }],
    });
    expect(realSuffix.duplicate("/items/0", { rekey })).toMatchObject({
      ok: true,
      applied: [{ op: "add", path: "/items/1", value: { id: "a-copy-2", name: "A" } }],
    });
  });

  test("rekeys spread paste payloads against multiple suffix bases", () => {
    const doc = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a", name: "A" },
        { id: "a-copy", name: "AC" },
        { id: "b", name: "B" },
        { id: "b-copy", name: "BC" },
      ],
    });

    expect(doc.clipboard.pastePayload("/items/-", [
      { id: "a", name: "A2" },
      { id: "b", name: "B2" },
    ], {
      spread: true,
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      applied: [
        { op: "add", path: "/items/4", value: { id: "a-copy-2", name: "A2" } },
        { op: "add", path: "/items/5", value: { id: "b-copy-2", name: "B2" } },
      ],
    });
  });

  test("rekeys duplicate spread payloads against suffix candidates without exact base conflicts", () => {
    const doc = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a-copy", name: "AC" },
      ],
    });

    expect(doc.clipboard.pastePayload("/items/-", [
      { id: "a", name: "A1" },
      { id: "a", name: "A2" },
    ], {
      spread: true,
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      applied: [
        { op: "add", path: "/items/1", value: { id: "a", name: "A1" } },
        { op: "add", path: "/items/2", value: { id: "a-copy-2", name: "A2" } },
      ],
    });
  });

  test("rekeys repeated suffix payload values without restarting attempts", () => {
    const doc = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a", name: "A" },
      ],
    });

    expect(doc.clipboard.pastePayload("/items/-", [
      { id: "a", name: "A1" },
      { id: "a", name: "A2" },
      { id: "a", name: "A3" },
      { id: "a", name: "A4" },
    ], {
      spread: true,
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      applied: [
        { op: "add", path: "/items/1", value: { id: "a-copy", name: "A1" } },
        { op: "add", path: "/items/2", value: { id: "a-copy-2", name: "A2" } },
        { op: "add", path: "/items/3", value: { id: "a-copy-3", name: "A3" } },
        { op: "add", path: "/items/4", value: { id: "a-copy-4", name: "A4" } },
      ],
    });
  });

  test("rekeys nested suffix fields while reusing payload traversal", () => {
    const NestedItem = z.object({
      id: z.string(),
      child: z.object({ id: z.string() }),
    });
    const NestedSchema = z.object({ items: z.array(NestedItem) });
    const doc = createJSONDocument(NestedSchema, {
      items: [
        { id: "a", child: { id: "c" } },
        { id: "a-copy", child: { id: "c-copy" } },
      ],
    });

    expect(doc.duplicate("/items/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    })).toMatchObject({
      ok: true,
      applied: [{
        op: "add",
        path: "/items/1",
        value: { id: "a-copy-2", child: { id: "c-copy-2" } },
      }],
    });
  });

  test("custom rekey strategy receives attempts until it mints a unique value", () => {
    const doc = createJSONDocument(Schema, {
      ...initial,
      items: [
        { id: "a", name: "A" },
        { id: "a-custom-1", name: "AC1" },
        { id: "b", name: "B" },
      ],
    });
    const attempts: number[] = [];

    expect(doc.duplicate("/items/0", {
      rekey: {
        fields: ["id"],
        strategy: (value, context) => {
          attempts.push(context.attempt);
          return `${String(value)}-custom-${context.attempt}`;
        },
      },
    })).toMatchObject({
      ok: true,
      applied: [{
        op: "add",
        path: "/items/1",
        value: { id: "a-custom-2", name: "A" },
      }],
    });
    expect(attempts).toEqual([1, 2]);
  });

  test("keeps reads and query separate from pointer-based patching", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.at("/items/0/name")).toEqual({ ok: true, path: "/items/0/name", value: "A" });
    expect(doc.exists("/items/99")).toBe(false);
    expect(doc.query("$.items[*].id")).toEqual({
      ok: true,
      query: "$.items[*].id",
      pointers: ["/items/0/id", "/items/1/id"],
    });
    expect(doc.entries("/meta")).toMatchObject({
      ok: true,
      kind: "record",
      entries: [{ key: "owner", path: "/meta/owner", value: "core" }],
    });
  });

  test("returns reasoned can* results instead of boolean guards", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.canPatch({ op: "replace", path: "/title", value: "next" })).toEqual({ ok: true });
    expect(doc.canReplace("/items/0/name", 1)).toMatchObject({ ok: false, code: "schema_violation" });
    expect(doc.canCopy("/items/99")).toMatchObject({ ok: false, code: "path_not_found" });
    expect(doc.canPastePayload("/items/-", { id: "c", name: "C" })).toEqual({ ok: true });
    expect(doc.canUndo()).toMatchObject({ ok: false, code: "empty_stack" });

    doc.clipboard.copy("/items/0");
    expect(doc.canPaste("/items/-")).toEqual({ ok: true });

    doc.patch({ op: "replace", path: "/title", value: "next" });
    expect(doc.canUndo()).toEqual({ ok: true });
  });

  test("uses selection snapshots with clipboard and explicit payload paste", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "multiple" },
    });

    doc.selection?.selectRanges(["/items/0", "/items/1"]);
    expect(doc.clipboard.copy()).toMatchObject({
      ok: true,
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });
    const pasted = doc.clipboard.paste("/items/-");
    expect(pasted).toMatchObject({
      ok: true,
      value: { items: [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "b" }] },
      applied: [
        { op: "add", path: "/items/2", value: { id: "a", name: "A" } },
        { op: "add", path: "/items/3", value: { id: "b", name: "B" } },
      ],
    });
    expect("patch" in pasted).toBe(false);
    expect("next" in pasted).toBe(false);
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "a", "b"]);

    expect(doc.clipboard.pastePayload("/items/-", { id: "x", name: "X" })).toMatchObject({
      ok: true,
      value: { items: [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "b" }, { id: "x" }] },
      applied: [{ op: "add", path: "/items/4", value: { id: "x", name: "X" } }],
    });
    expect(doc.value.items.at(-1)).toEqual({ id: "x", name: "X" });
    expect(doc.history.undoDepth).toBe(2);
  });

  test("spread paste offsets numeric insertion paths", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.pastePayload("/items/1", [
      { id: "x", name: "X" },
      { id: "y", name: "Y" },
    ], { spread: true })).toMatchObject({
      ok: true,
      applied: [
        { op: "add", path: "/items/1", value: { id: "x", name: "X" } },
        { op: "add", path: "/items/2", value: { id: "y", name: "Y" } },
      ],
    });

    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "x", "y", "b"]);
  });

  test("clipboard read returns a cloned payload", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.copy("/items/0")).toMatchObject({ ok: true });
    const first = doc.clipboard.read();
    if (!first.ok) throw new Error("clipboard read failed");
    (first.payload as { name: string }).name = "mutated";

    expect(doc.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
  });

  test("clipboard write validates and clones external payloads", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const payload: Record<string, unknown> = {
      nested: { name: "A" },
    };
    Object.defineProperty(payload, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    expect(doc.clipboard.write(payload)).toEqual({ ok: true });
    (payload.nested as { name: string }).name = "mutated";

    const read = doc.clipboard.read();
    expect(read).toMatchObject({
      ok: true,
      payload: { nested: { name: "A" } },
    });
    if (!read.ok) throw new Error("clipboard read failed");
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(read.payload as object, "__proto__")).toBe(true);
    expect((read.payload as Record<string, unknown>).__proto__).toEqual({ safe: true });
  });

  test("clipboard write clones large external array payloads", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const payload = Array.from({ length: 1024 }, (_, index) => ({
      id: `id-${index}`,
      nested: { value: index },
    }));

    expect(doc.clipboard.write(payload)).toEqual({ ok: true });
    payload[0]!.nested.value = -1;

    const read = doc.clipboard.read();
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) throw new Error("clipboard read failed");
    expect((read.payload as typeof payload).slice(0, 2)).toEqual([
      { id: "id-0", nested: { value: 0 } },
      { id: "id-1", nested: { value: 1 } },
    ]);
  });

  test("clipboard write clones large external object payloads with array fields", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const payload = {
      items: Array.from({ length: 4096 }, (_, index) => ({
        id: `id-${index}`,
        nested: { value: index },
      })),
      meta: { count: 4096 },
    };

    expect(doc.clipboard.write(payload)).toEqual({ ok: true });
    payload.items[0]!.nested.value = -1;
    payload.meta.count = 0;

    const read = doc.clipboard.read();
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) throw new Error("clipboard read failed");
    expect((read.payload as typeof payload).items[0]).toEqual({
      id: "id-0",
      nested: { value: 0 },
    });
    expect((read.payload as typeof payload).meta).toEqual({ count: 4096 });
  });

  test("clipboard write clones trusted document field payloads", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.write(doc.value.items)).toEqual({ ok: true });
    expect(doc.patch({ op: "replace", path: "/items/0/name", value: "changed" })).toEqual({ ok: true });

    const read = doc.clipboard.read();
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) throw new Error("clipboard read failed");
    expect(read.payload).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
  });

  test("clipboard copy preserves __proto__ as trusted JSON data", () => {
    const doc = createJSONDocument(z.any(), {
      item: Object.defineProperty({ id: "a" }, "__proto__", {
        value: { safe: true },
        enumerable: true,
        configurable: true,
        writable: true,
      }),
    });

    expect(doc.clipboard.copy("/item")).toMatchObject({ ok: true });
    const read = doc.clipboard.read();
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) throw new Error("clipboard read failed");
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(read.payload as object, "__proto__")).toBe(true);
    expect((read.payload as Record<string, unknown>).__proto__).toEqual({ safe: true });
  });

  test("clipboard write clones trusted nested document source payloads", () => {
    const NestedSchema = z.object({
      wrapper: z.object({
        items: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    });
    const doc = createJSONDocument(NestedSchema, {
      wrapper: { items: initial.items },
    }, { history: 10 });

    expect(doc.clipboard.write(doc.value.wrapper.items, { source: "/wrapper/items" })).toEqual({ ok: true });
    expect(doc.patch({ op: "replace", path: "/wrapper/items/0/name", value: "changed" })).toEqual({ ok: true });

    const read = doc.clipboard.read();
    expect(read).toMatchObject({ ok: true });
    if (!read.ok) throw new Error("clipboard read failed");
    expect(read.payload).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
  });

  test("clipboard clones ignore enumerable Object.prototype keys", () => {
    const key = "__zodCrudInherited";
    Object.defineProperty(Object.prototype, key, {
      value: { inherited: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    try {
      const doc = createJSONDocument(Schema, initial, { history: 10 });
      const copied = doc.clipboard.copy("/items");
      expect(copied).toMatchObject({ ok: true });
      if (!copied.ok) throw new Error("clipboard copy failed");
      expect(
        Object.prototype.hasOwnProperty.call((copied.payload as typeof initial.items)[0], key),
      ).toBe(false);

      const payload = Array.from({ length: 1024 }, (_, index) => ({
        id: `id-${index}`,
        nested: { value: index },
      }));
      expect(doc.clipboard.write(payload)).toEqual({ ok: true });
      const read = doc.clipboard.read();
      expect(read).toMatchObject({ ok: true });
      if (!read.ok) throw new Error("clipboard read failed");
      expect(
        Object.prototype.hasOwnProperty.call((read.payload as typeof payload)[0], key),
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call((read.payload as typeof payload)[0]!.nested, key),
      ).toBe(false);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  });

  test("clipboard write rejects non-JSON payload shapes", () => {
    const accessor: Record<string, unknown> = { ok: true };
    Object.defineProperty(accessor, "computed", {
      get: () => true,
      enumerable: true,
      configurable: true,
    });
    const sparse = [1, 2, 3];
    delete sparse[1];
    const symbolPayload = { ok: true, [Symbol("secret")]: true };

    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.write(accessor)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.write(sparse)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.write(symbolPayload)).toMatchObject({ ok: false, code: "not_serializable" });
    expect(doc.clipboard.hasData).toBe(false);
  });

  test("clipboard write rejects invalid sources before payload cloning", () => {
    const payload: Record<string, unknown> = { ok: true };
    Object.defineProperty(payload, "computed", {
      get: () => true,
      enumerable: true,
      configurable: true,
    });
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.clipboard.write(payload, { source: "items/0" })).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "items/0",
    });
    expect(doc.clipboard.hasData).toBe(false);
  });

  test("commits selection-aware text patches with serializable history metadata", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{ anchor: { path: "/title", offset: 0 }, focus: { path: "/title", offset: 0 } }],
      },
    });
    const metadata: unknown[] = [];
    doc.subscribe((_, changeMetadata) => {
      if (changeMetadata) metadata.push(changeMetadata);
    });

    const planned = doc.selection?.textPatch("A");
    expect(planned).toMatchObject({ ok: true });
    if (!planned?.ok) throw new Error("text patch did not plan");
    expect(doc.commit(planned.patch, {
      label: "typing",
      origin: "keyboard",
      mergeKey: "title",
      selection: planned.selection,
    })).toEqual({ ok: true });

    expect(doc.value.title).toBe("Adraft");
    expect(doc.selection?.caret).toEqual({ path: "/title", offset: 1 });
    expect(metadata).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(metadata[0]))).toEqual(metadata[0]);
  });

  test("loads, resets, and subscribes through document methods", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const patches: unknown[] = [];
    doc.subscribe((patch) => patches.push(patch));

    doc.patch({ op: "replace", path: "/title", value: "changed" });
    expect(doc.history.canUndo).toBe(true);

    expect(doc.load({ ...initial, title: "loaded" }, { preserveHistory: true })).toEqual({ ok: true });
    expect(doc.history.canUndo).toBe(true);

    expect(doc.reset()).toEqual({ ok: true });
    expect(doc.value).toEqual(initial);
    expect(doc.history.canUndo).toBe(false);
    expect(patches.length).toBe(3);
  });
});
