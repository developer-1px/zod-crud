import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  applyDocumentDiff,
  createDocumentDiff,
  diffDocument,
} from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  settings: z.object({
    owner: z.string(),
    archived: z.boolean().optional(),
  }),
  cards: z.array(z.object({
    id: z.string(),
    title: z.string(),
    done: z.boolean(),
  })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    settings: {
      owner: "editor",
      archived: false,
    },
    cards: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
    ],
  });
}

describe("@zod-crud/document-diff", () => {
  test("plans object field changes without mutating", () => {
    const doc = createDoc();
    const target = {
      title: "Final",
      settings: {
        owner: "editor",
      },
      cards: [
        { id: "a", title: "A", done: true },
        { id: "b", title: "B", done: false },
      ],
    };

    expect(diffDocument(doc, target)).toMatchObject({
      ok: true,
      changed: true,
      operations: [
        { op: "replace", path: "/cards/0/done", value: true },
        { op: "remove", path: "/settings/archived" },
        { op: "replace", path: "/title", value: "Final" },
      ],
    });
    expect(doc.value.title).toBe("Draft");
    expect(doc.value.settings.archived).toBe(false);
  });

  test("applies a planned diff through patch", () => {
    const doc = createDoc();
    const diff = createDocumentDiff(doc);

    const target = {
      title: "Final",
      settings: {
        owner: "publisher",
        archived: false,
      },
      cards: [
        { id: "a", title: "A", done: true },
        { id: "b", title: "B", done: true },
      ],
    };

    expect(diff.canApply(target)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(diff.apply(target, { label: "import target" })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(doc.value).toEqual(target);
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/cards/0/done", value: true },
      { op: "replace", path: "/cards/1/done", value: true },
      { op: "replace", path: "/settings/owner", value: "publisher" },
      { op: "replace", path: "/title", value: "Final" },
    ]);
  });

  test("replaces arrays when array shape changes", () => {
    const doc = createDoc();
    const diff = createDocumentDiff(doc);

    const target = {
      ...doc.value,
      cards: [
        { id: "a", title: "A", done: false },
        { id: "c", title: "C", done: true },
        { id: "b", title: "B", done: false },
      ],
    };

    expect(diff.diff(target)).toMatchObject({
      ok: true,
      operations: [
        { op: "replace", path: "/cards", value: target.cards },
      ],
    });
  });

  test("returns unchanged when target equals current value", () => {
    const doc = createDoc();
    const diff = createDocumentDiff(doc);

    expect(diff.apply(doc.value)).toMatchObject({
      ok: true,
      changed: false,
      operations: [],
    });
    expect(doc.lastPatch).toEqual([]);
  });

  test("rejects invalid target values through canPatch", () => {
    const doc = createDoc();
    const diff = createDocumentDiff(doc);

    expect(diff.canApply({
      ...doc.value,
      cards: [
        { id: "a", title: "A", done: "no" },
      ],
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.cards[0]?.done).toBe(false);
  });

  test("can replace the root when target shape changes", () => {
    const SchemaUnion = z.union([
      Schema,
      z.literal("empty"),
    ]);
    const doc = createJSONDocument(SchemaUnion, createDoc().value);

    expect(applyDocumentDiff(doc, "empty")).toMatchObject({
      ok: true,
      operations: [
        { op: "replace", path: "", value: "empty" },
      ],
    });
    expect(doc.value).toBe("empty");
  });

  test("returns isolated values and operations", () => {
    const doc = createDoc();
    const diff = createDocumentDiff(doc);
    const target = {
      ...doc.value,
      title: "Final",
    };

    const change = diff.diff(target);
    if (!change.ok) throw new Error(change.reason);

    (change.value as { title: string }).title = "Changed";
    const operation = change.operations[0];
    if (operation?.op !== "replace") throw new Error("expected replace operation");
    operation.value = "Changed";

    expect(diff.diff(target)).toMatchObject({
      ok: true,
      value: {
        title: "Final",
      },
      operations: [
        { op: "replace", path: "/title", value: "Final" },
      ],
    });
    expect(doc.value.title).toBe("Draft");
  });
});
