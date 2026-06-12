import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { createPatchPreview, previewPatch } from "../src/index.js";

const Item = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  title: z.string(),
  items: z.array(Item),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    items: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
    ],
  });
}

describe("@interactive-os/json-document-patch-preview", () => {
  test("previews the next document value without mutating", () => {
    const doc = createDoc();
    const previewer = createPatchPreview(Schema, doc);

    expect(previewer.canPreview([
      { op: "replace", path: "/title", value: "Next" },
    ])).toEqual({ ok: true });

    const preview = previewer.preview([
      { op: "replace", path: "/title", value: "Next" },
      { op: "add", path: "/items/-", value: { id: "c", title: "C", done: true } },
    ]);

    expect(preview).toMatchObject({
      ok: true,
      value: {
        title: "Next",
        items: [
          { id: "a", title: "A", done: false },
          { id: "b", title: "B", done: false },
          { id: "c", title: "C", done: true },
        ],
      },
      applied: [
        { op: "replace", path: "/title", value: "Next" },
        { op: "add", path: "/items/2", value: { id: "c", title: "C", done: true } },
      ],
      changed: true,
    });
    expect(doc.value.title).toBe("Draft");
    expect(doc.value.items).toHaveLength(2);
  });

  test("rejects invalid patches through document capabilities", () => {
    const doc = createDoc();

    expect(previewPatch(Schema, doc, [
      { op: "replace", path: "/items/0/title", value: 123 },
    ])).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.items[0]?.title).toBe("A");
  });

  test("uses the current document value at preview time", () => {
    const doc = createDoc();
    const previewer = createPatchPreview(Schema, doc);

    expect(doc.replace("/title", "Current")).toEqual({ ok: true });

    expect(previewer.preview([
      { op: "replace", path: "/items/0/done", value: true },
    ])).toMatchObject({
      ok: true,
      value: {
        title: "Current",
        items: [
          { id: "a", title: "A", done: true },
          { id: "b", title: "B", done: false },
        ],
      },
    });
  });

  test("reports preview failure when the supplied schema does not match the document", () => {
    const doc = createDoc();
    const WrongSchema = z.object({
      title: z.number(),
      items: z.array(Item),
    });

    expect(previewPatch(WrongSchema, doc, [
      { op: "replace", path: "/items/0/done", value: true },
    ])).toMatchObject({
      ok: false,
      code: "preview_failed",
      result: {
        ok: false,
        code: "schema_violation",
      },
    });
  });

  test("can use the trusted-state root helper path for schema-owned documents", () => {
    const doc = createDoc();

    expect(previewPatch(Schema, doc, [
      { op: "replace", path: "/title", value: "Trusted" },
    ], {
      trustedState: true,
    })).toMatchObject({
      ok: true,
      value: {
        title: "Trusted",
      },
    });
  });

  test("returns isolated preview values and applied operations", () => {
    const doc = createDoc();
    const preview = previewPatch(Schema, doc, [
      { op: "replace", path: "/items/0", value: { id: "a", title: "A1", done: true } },
    ]);
    if (!preview.ok) throw new Error(preview.reason);

    preview.value.items[0]!.title = "mutated";
    const operation = preview.applied[0];
    if (operation?.op !== "replace") throw new Error("expected replace operation");
    (operation.value as { title: string }).title = "mutated";

    const next = previewPatch(Schema, doc, [
      { op: "replace", path: "/items/0", value: { id: "a", title: "A1", done: true } },
    ]);

    expect(next).toMatchObject({
      ok: true,
      value: {
        items: [
          { id: "a", title: "A1", done: true },
          { id: "b", title: "B", done: false },
        ],
      },
      applied: [
        { op: "replace", path: "/items/0", value: { id: "a", title: "A1", done: true } },
      ],
    });
    expect(doc.value.items[0]?.title).toBe("A");
  });
});
