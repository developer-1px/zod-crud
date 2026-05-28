import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  WEB_PERSISTENCE_KIND,
  WEB_PERSISTENCE_VERSION,
  createDocumentPersistence,
  defaultDocumentPersistenceCodec,
  type DocumentPersistenceHost,
} from "../src/index.js";

const Item = z.object({ id: z.string(), name: z.string().min(1) });
const Schema = z.object({
  title: z.string(),
  items: z.array(Item),
});

function createDoc(initial = {
  title: "Draft",
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
}) {
  return createJSONDocument(Schema, initial, {
    history: 10,
    selection: true,
  });
}

function createMemoryHost(initial: Record<string, string> = {}): DocumentPersistenceHost & {
  data: Map<string, string>;
} {
  return {
    data: new Map(Object.entries(initial)),
    getItem(key) {
      return this.data.get(key) ?? null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    },
    removeItem(key) {
      this.data.delete(key);
    },
  };
}

function tick() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("@zod-crud/persist-web", () => {
  test("saves document value and selection to a storage-like host", async () => {
    const doc = createDoc();
    doc.selection?.collapse("/items/1/name");
    const host = createMemoryHost();
    const persistence = createDocumentPersistence(doc, { key: "draft", host });

    const result = await persistence.save();

    expect(result).toMatchObject({
      ok: true,
      key: "draft",
      selectionSaved: true,
    });
    const stored = JSON.parse(host.data.get("draft") ?? "");
    expect(stored).toMatchObject({
      kind: WEB_PERSISTENCE_KIND,
      version: WEB_PERSISTENCE_VERSION,
      value: {
        title: "Draft",
        items: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
      },
      selection: {
        selectedPointers: ["/items/1/name"],
        primaryIndex: 0,
        anchor: "/items/1/name",
        focus: "/items/1/name",
      },
    });
    expect(typeof stored.savedAt).toBe("string");
  });

  test("restores persisted value and optionally restores selection", async () => {
    const source = createDoc();
    source.selection?.collapse("/items/1/name");
    const host = createMemoryHost();
    await createDocumentPersistence(source, { key: "draft", host }).save();

    const target = createDoc({ title: "Empty", items: [] });
    target.selection?.collapse("/title");
    const persistence = createDocumentPersistence(target, { key: "draft", host });

    const result = await persistence.restore({ restoreSelection: true });

    expect(result).toMatchObject({
      ok: true,
      key: "draft",
      selectionSaved: true,
      selectionRestored: true,
    });
    expect(target.value).toEqual(source.value);
    expect(target.selection?.primaryPointer).toBe("/items/1/name");
  });

  test("threads preserveHistory through public document load", async () => {
    const source = createDoc();
    const host = createMemoryHost();
    await createDocumentPersistence(source, { key: "draft", host }).save();

    const resetHistory = createDoc({ title: "Current", items: [] });
    resetHistory.patch({ op: "replace", path: "/title", value: "Changed" });
    expect(resetHistory.canUndo()).toEqual({ ok: true });
    await createDocumentPersistence(resetHistory, { key: "draft", host }).restore();
    expect(resetHistory.canUndo()).toMatchObject({ ok: false, code: "empty_stack" });

    const keepHistory = createDoc({ title: "Current", items: [] });
    keepHistory.patch({ op: "replace", path: "/title", value: "Changed" });
    expect(keepHistory.canUndo()).toEqual({ ok: true });
    await createDocumentPersistence(keepHistory, { key: "draft", host }).restore({ preserveHistory: true });
    expect(keepHistory.canUndo()).toEqual({ ok: true });
  });

  test("watches document changes and stops saving after unsubscribe", async () => {
    const doc = createDoc();
    const host = createMemoryHost();
    const onSave = vi.fn();
    const persistence = createDocumentPersistence(doc, { key: "draft", host });

    const stop = persistence.watch({ immediate: true, onSave });
    await tick();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(defaultDocumentPersistenceCodec.decode(host.data.get("draft") ?? "").value).toMatchObject({
      title: "Draft",
    });

    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    await tick();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(defaultDocumentPersistenceCodec.decode(host.data.get("draft") ?? "").value).toMatchObject({
      title: "Changed",
    });

    stop();
    doc.patch({ op: "replace", path: "/title", value: "After stop" });
    await tick();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(defaultDocumentPersistenceCodec.decode(host.data.get("draft") ?? "").value).toMatchObject({
      title: "Changed",
    });
  });

  test("supports read/write/remove host methods and clear", async () => {
    const doc = createDoc();
    const store = new Map<string, string>();
    const host: DocumentPersistenceHost = {
      read: (key) => store.get(key) ?? null,
      write: (key, value) => {
        store.set(key, value);
      },
      remove: (key) => {
        store.delete(key);
      },
    };
    const persistence = createDocumentPersistence(doc, { key: "draft", host });

    await expect(persistence.save()).resolves.toMatchObject({ ok: true });
    expect(store.has("draft")).toBe(true);
    await expect(persistence.clear()).resolves.toEqual({ ok: true, key: "draft" });
    expect(store.has("draft")).toBe(false);
  });

  test("reports empty and parse errors before mutating the document", async () => {
    const doc = createDoc();
    const persistence = createDocumentPersistence(doc, {
      key: "missing",
      host: createMemoryHost({ invalid: "not json" }),
    });

    await expect(persistence.restore()).resolves.toMatchObject({
      ok: false,
      code: "persistence_empty",
    });
    expect(doc.value.title).toBe("Draft");

    const invalid = createDocumentPersistence(doc, {
      key: "invalid",
      host: createMemoryHost({ invalid: "not json" }),
    });
    await expect(invalid.restore()).resolves.toMatchObject({
      ok: false,
      code: "persistence_parse_failed",
    });
    expect(doc.value.title).toBe("Draft");
  });

  test("surfaces schema validation failures from restore without core changes", async () => {
    const doc = createDoc();
    const host = createMemoryHost({
      draft: defaultDocumentPersistenceCodec.encode({
        value: { title: "Invalid", items: [{ id: "x", name: "" }] },
        selection: null,
        savedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    const persistence = createDocumentPersistence(doc, { key: "draft", host });

    const result = await persistence.restore();

    expect(result).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.value.items).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
  });
});
