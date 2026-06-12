import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument, type JSONDocumentOptions } from "@interactive-os/json-document";
import { createDirtyState } from "../src/index.js";

const Draft = z.object({
  title: z.string(),
  body: z.string(),
  savedAt: z.string().nullable(),
  tags: z.array(z.string()),
});

type DraftValue = z.output<typeof Draft>;

function createDraft(
  value: Partial<DraftValue> = {},
  options: Pick<JSONDocumentOptions, "history"> = {},
) {
  return createJSONDocument(Draft, {
    title: "Draft",
    body: "Body",
    savedAt: null,
    tags: ["lab"],
    ...value,
  }, options);
}

describe("@interactive-os/json-document-dirty-state", () => {
  test("tracks dirty state against the initial JSON baseline", () => {
    const doc = createDraft();
    const dirty = createDirtyState(doc);

    expect(dirty.isDirty()).toBe(false);
    expect(dirty.current()).toEqual({
      dirty: false,
      value: {
        title: "Draft",
        body: "Body",
        savedAt: null,
        tags: ["lab"],
      },
      baseline: {
        title: "Draft",
        body: "Body",
        savedAt: null,
        tags: ["lab"],
      },
    });

    expect(doc.patch({ op: "replace", path: "/title", value: "Changed" })).toEqual({ ok: true });
    expect(dirty.isDirty()).toBe(true);
    expect(dirty.current()).toMatchObject({
      dirty: true,
      value: { title: "Changed" },
      baseline: { title: "Draft" },
    });
  });

  test("marks the current document as the clean baseline", () => {
    const doc = createDraft();
    const dirty = createDirtyState(doc);

    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    const snapshot = dirty.markClean();

    expect(snapshot).toMatchObject({
      dirty: false,
      value: { title: "Changed" },
      baseline: { title: "Changed" },
    });
    expect(dirty.isDirty()).toBe(false);

    doc.patch({ op: "replace", path: "/title", value: "Draft" });
    expect(dirty.current()).toMatchObject({
      dirty: true,
      value: { title: "Draft" },
      baseline: { title: "Changed" },
    });
  });

  test("discards to the clean baseline through document load", () => {
    const doc = createDraft({}, { history: 10 });
    const dirty = createDirtyState(doc);

    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    expect(doc.canUndo()).toEqual({ ok: true });

    expect(dirty.discard()).toEqual({ ok: true });
    expect(doc.value).toEqual({
      title: "Draft",
      body: "Body",
      savedAt: null,
      tags: ["lab"],
    });
    expect(dirty.isDirty()).toBe(false);
    expect(doc.canUndo()).toMatchObject({ ok: false, code: "empty_stack" });
  });

  test("threads preserveHistory through discard", () => {
    const doc = createDraft({}, { history: 10 });
    const dirty = createDirtyState(doc);

    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    expect(doc.canUndo()).toEqual({ ok: true });

    expect(dirty.discard({ preserveHistory: true })).toEqual({ ok: true });
    expect(doc.value.title).toBe("Draft");
    expect(dirty.isDirty()).toBe(false);
    expect(doc.canUndo()).toEqual({ ok: true });
  });

  test("subscribes to dirty snapshots and stops after unsubscribe or dispose", () => {
    const doc = createDraft();
    const dirty = createDirtyState(doc);
    const listener = vi.fn();

    const unsubscribe = dirty.subscribe(listener);
    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    doc.patch({ op: "replace", path: "/body", value: "Edited" });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([snapshot]) => snapshot.dirty)).toEqual([true, true]);

    unsubscribe();
    doc.patch({ op: "replace", path: "/body", value: "Edited again" });
    expect(listener).toHaveBeenCalledTimes(2);

    const afterDispose = vi.fn();
    dirty.subscribe(afterDispose);
    dirty.dispose();
    doc.patch({ op: "replace", path: "/body", value: "Ignored" });
    expect(afterDispose).not.toHaveBeenCalled();
  });

  test("uses a custom equality comparator when JSON signatures are too strict", () => {
    const doc = createDraft({ savedAt: "2026-05-28T00:00:00.000Z" });
    const dirty = createDirtyState(doc, {
      equals(current, baseline) {
        return current.title === baseline.title
          && current.body === baseline.body
          && current.tags.join("\n") === baseline.tags.join("\n");
      },
    });

    doc.patch({ op: "replace", path: "/savedAt", value: "2026-05-29T00:00:00.000Z" });
    expect(dirty.isDirty()).toBe(false);

    doc.patch({ op: "replace", path: "/title", value: "Changed" });
    expect(dirty.isDirty()).toBe(true);
  });

  test("returns isolated JSON snapshots", () => {
    const doc = createDraft();
    const dirty = createDirtyState(doc);
    const snapshot = dirty.current();

    snapshot.value.tags.push("mutated");
    snapshot.baseline.tags.push("mutated");

    expect(doc.value.tags).toEqual(["lab"]);
    expect(dirty.current().baseline.tags).toEqual(["lab"]);
  });
});
