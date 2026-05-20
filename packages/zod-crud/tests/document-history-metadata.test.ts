import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";
import type { JSONChangeMetadata } from "../src/index.js";

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
    const metadata: JSONChangeMetadata[] = [];
    doc.ops.subscribe((_, changeMetadata) => {
      if (changeMetadata) metadata.push(changeMetadata);
    });

    doc.history.transaction({ label: "Rename title", origin: "keyboard", mergeKey: "title" }, () => {
      doc.ops.replace("/title", "final");
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
      doc.ops.replace("/title", "final");
      doc.ops.replace("/count", 1);
    });

    expect(doc.history.undoDepth).toBe(1);
    expect(doc.value).toEqual({ title: "final", count: 1 });

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.history.redoDepth).toBe(1);

    expect(doc.commands.redo()).toBe(true);
    expect(doc.value).toEqual({ title: "final", count: 1 });
  });

  test("mergeLast accepts merge metadata without changing stack behavior", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.ops.replace("/title", "a");
    doc.ops.replace("/title", "b");

    expect(doc.history.mergeLast({ mergeKey: "typing:title" })).toBe(true);
    expect(doc.history.undoDepth).toBe(1);

    expect(doc.commands.undo()).toBe(true);
    expect(doc.value.title).toBe("draft");
  });
});
