import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  count: z.number(),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  count: 0,
};

describe("doc.history metadata", () => {
  test("transaction metadata flows through subscribe as serializable JSON", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/title"] },
    });
    const metadata: Array<NonNullable<Parameters<Parameters<typeof doc.subscribe>[0]>[1]>> = [];
    doc.subscribe((_, changeMetadata) => {
      if (changeMetadata) metadata.push(changeMetadata);
    });

    doc.history.transaction({ label: "Rename title", origin: "keyboard", mergeKey: "title" }, () => {
      doc.patch({ op: "replace", path: "/title", value: "final" });
    });

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      label: "Rename title",
      origin: "keyboard",
      mergeKey: "title",
      selectionBefore: { selectedPointers: ["/title"] },
      selectionAfter: { selectedPointers: ["/title"] },
    });
    expect(JSON.parse(JSON.stringify(metadata[0]))).toEqual(metadata[0]);
  });

  test("transaction metadata does not change undo and redo semantics", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.history.transaction({ label: "Edit fields", origin: "programmatic", mergeKey: "batch" }, () => {
      doc.patch({ op: "replace", path: "/title", value: "final" });
      doc.patch({ op: "replace", path: "/count", value: 1 });
    });

    expect(doc.history.undoDepth).toBe(1);
    expect(doc.value).toEqual({ title: "final", count: 1 });

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.history.redoDepth).toBe(1);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value).toEqual({ title: "final", count: 1 });
  });

  test("mergeLast accepts merge metadata without changing stack behavior", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.patch({ op: "replace", path: "/title", value: "a" });
    doc.patch({ op: "replace", path: "/title", value: "b" });

    expect(doc.history.mergeLast({ mergeKey: "typing:title" })).toBe(true);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.title).toBe("draft");
  });

  test("text commands pass serializable history metadata through patch commits", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: {
        mode: "extended",
        initial: [{
          anchor: { path: "/title", offset: 0 },
          focus: { path: "/title", offset: 0 },
        }],
      },
    });
    const metadata: Array<NonNullable<Parameters<Parameters<typeof doc.subscribe>[0]>[1]>> = [];
    doc.subscribe((_, changeMetadata) => {
      if (changeMetadata) metadata.push(changeMetadata);
    });

    const insert = doc.selection?.textPatch("A");
    expect(insert).toMatchObject({ ok: true });
    if (insert?.ok) doc.commit(insert.patch, {
      label: "Insert title text",
      origin: "keyboard",
      mergeKey: "typing:title",
      selection: insert.selection,
    });

    const deletion = doc.selection?.deleteText();
    expect(deletion).toMatchObject({ ok: true });
    if (deletion?.ok) doc.commit(deletion.patch, {
      label: "Delete title text",
      origin: "keyboard",
      mergeKey: "typing:title",
      selection: deletion.selection,
    });

    expect(metadata).toHaveLength(2);
    expect(metadata[0]).toMatchObject({
      label: "Insert title text",
      origin: "keyboard",
      mergeKey: "typing:title",
      selectionBefore: { focus: { path: "/title", offset: 0 } },
      selectionAfter: { focus: { path: "/title", offset: 1 } },
    });
    expect(metadata[1]).toMatchObject({
      label: "Delete title text",
      origin: "keyboard",
      mergeKey: "typing:title",
      selectionBefore: { focus: { path: "/title", offset: 1 } },
      selectionAfter: { focus: { path: "/title", offset: 0 } },
    });
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
  });
});
