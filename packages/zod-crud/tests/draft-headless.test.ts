import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createDraft, createJSONDocument } from "../src/index.js";

const Schema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  meta: z.object({
    label: z.string().min(3),
  }),
});

const initial: z.output<typeof Schema> = {
  slug: "foo",
  title: "Title",
  meta: { label: "Old" },
};

describe("createDraft", () => {
  test("keeps invalid attempts headlessly and commits valid field edits", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const draft = createDraft(doc);
    const changes: Array<{ pending: boolean; dirty: boolean }> = [];
    draft.subscribe((next) => {
      changes.push({ pending: next.pending, dirty: next.dirty });
    });

    const invalid = draft.field("/slug").set("");

    expect(invalid.ok).toBe(false);
    expect(draft.field("/slug")).toMatchObject({
      value: "",
      committed: "foo",
      pending: true,
      touched: true,
    });
    expect(doc.value.slug).toBe("foo");
    expect(draft.pendingPaths).toEqual(["/slug"]);

    const valid = draft.field("/title").set("Renamed");

    expect(valid.ok).toBe(true);
    expect(doc.value.title).toBe("Renamed");
    expect(draft.field("/title")).toMatchObject({
      committed: "Renamed",
      dirty: true,
      pending: false,
      touched: true,
    });
    expect(draft.dirty).toBe(true);
    expect(draft.canSave).toBe(false);

    draft.field("/slug").discardAttempt();
    expect(draft.pending).toBe(false);
    expect(draft.canSave).toBe(true);

    draft.markSaved();
    expect(draft.dirty).toBe(false);
    expect(draft.canSave).toBe(false);

    draft.dispose();
    doc.ops.replace("/title", "After dispose");
    expect(changes.length).toBeGreaterThan(0);
  });

  test("resetToBaseline restores the saved document without clearing history", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const draft = createDraft(doc);

    draft.field("/title").set("Renamed");
    expect(doc.history.canUndo).toBe(true);

    const reset = draft.resetToBaseline();

    expect(reset.ok).toBe(true);
    expect(doc.value).toEqual(initial);
    expect(doc.history.canUndo).toBe(true);
    draft.dispose();
  });
});
