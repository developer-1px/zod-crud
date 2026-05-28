import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createQueryWatch, type QueryWatchSnapshot } from "../src/index.js";

const Item = z.object({
  id: z.string(),
  name: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  items: z.array(Item),
  issues: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
  meta: z.object({
    title: z.string(),
    summary: z.object({
      count: z.number(),
    }),
  }),
});

function createDoc() {
  return createJSONDocument(Schema, {
    items: [
      { id: "a", name: "A", done: false },
      { id: "b", name: "B", done: true },
    ],
    issues: [
      { path: "/items/0/name", message: "short name" },
    ],
    meta: {
      title: "List",
      summary: {
        count: 2,
      },
    },
  }, {
    history: 10,
  });
}

describe("@zod-crud/query-watch", () => {
  test("projects the current JSONPath pointers and values", () => {
    const watch = createQueryWatch(createDoc(), "$.items[*].name");

    expect(watch.current()).toEqual({
      ok: true,
      jsonPath: "$.items[*].name",
      pointers: ["/items/0/name", "/items/1/name"],
      values: ["A", "B"],
      matches: [
        { path: "/items/0/name", value: "A" },
        { path: "/items/1/name", value: "B" },
      ],
    });
  });

  test("refreshes snapshots from document subscriptions", () => {
    const doc = createDoc();
    const watch = createQueryWatch(doc, "$.items[*].name");
    const events: QueryWatchSnapshot<string>[] = [];

    watch.subscribe((snapshot) => {
      events.push(snapshot as QueryWatchSnapshot<string>);
    });

    expect(doc.patch({ op: "replace", path: "/items/0/name", value: "A1" })).toEqual({ ok: true });
    expect(doc.patch({ op: "add", path: "/items/-", value: { id: "c", name: "C", done: false } })).toEqual({ ok: true });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      ok: true,
      pointers: ["/items/0/name", "/items/1/name"],
      values: ["A1", "B"],
    });
    expect(events[1]).toMatchObject({
      ok: true,
      pointers: ["/items/0/name", "/items/1/name", "/items/2/name"],
      values: ["A1", "B", "C"],
    });
    expect(watch.current()).toMatchObject({
      ok: true,
      values: ["A1", "B", "C"],
    });
  });

  test("does not notify when an unrelated document change leaves the projection unchanged", () => {
    const doc = createDoc();
    const watch = createQueryWatch(doc, "$.items[*].name");
    const events: QueryWatchSnapshot[] = [];

    watch.subscribe((snapshot) => {
      events.push(snapshot);
    });

    expect(doc.patch({ op: "replace", path: "/meta/title", value: "Next" })).toEqual({ ok: true });

    expect(events).toEqual([]);
    expect(watch.current()).toMatchObject({
      ok: true,
      values: ["A", "B"],
    });
  });

  test("covers common derived panels without product-specific API", () => {
    const doc = createDoc();
    const done = createQueryWatch(doc, "$.items[?@.done==true].id");
    const summary = createQueryWatch(doc, "$.meta.summary");
    const issues = createQueryWatch(doc, "$.issues[*].message");

    expect(done.current()).toMatchObject({
      ok: true,
      pointers: ["/items/1/id"],
      values: ["b"],
    });
    expect(summary.current()).toMatchObject({
      ok: true,
      pointers: ["/meta/summary"],
      values: [{ count: 2 }],
    });
    expect(issues.current()).toMatchObject({
      ok: true,
      pointers: ["/issues/0/message"],
      values: ["short name"],
    });
  });

  test("snapshots object values instead of retaining live object references", () => {
    const doc = createDoc();
    const watch = createQueryWatch<{ meta: { summary: { count: number } } }, { count: number }>(
      doc,
      "$.meta.summary",
    );
    const current = watch.current();
    if (!current.ok) throw new Error(current.reason);

    expect(doc.replace("/meta/summary/count", 3)).toEqual({ ok: true });
    expect(current.values).toEqual([{ count: 2 }]);
    expect(current.matches).toEqual([{ path: "/meta/summary", value: { count: 2 } }]);
  });

  test("supports manual refresh and listener unsubscribe", () => {
    const doc = createDoc();
    const watch = createQueryWatch(doc, "$.items[?@.done==true].id");
    const events: QueryWatchSnapshot[] = [];
    const unsubscribe = watch.subscribe((snapshot) => {
      events.push(snapshot);
    });

    expect(watch.current()).toMatchObject({
      ok: true,
      pointers: ["/items/1/id"],
      values: ["b"],
    });

    expect(doc.patch({ op: "replace", path: "/items/0/done", value: true })).toEqual({ ok: true });
    unsubscribe();
    expect(doc.patch({ op: "replace", path: "/items/1/done", value: false })).toEqual({ ok: true });

    expect(events).toHaveLength(1);
    expect(watch.refresh()).toMatchObject({
      ok: true,
      pointers: ["/items/0/id"],
      values: ["a"],
    });
  });

  test("reports JSONPath syntax errors through canFind", () => {
    const watch = createQueryWatch(createDoc(), "$.items[");

    expect(watch.current()).toMatchObject({
      ok: false,
      jsonPath: "$.items[",
      code: "syntax_error",
      pointers: [],
    });
  });

  test("dispose stops document-driven refreshes", () => {
    const doc = createDoc();
    const watch = createQueryWatch(doc, "$.items[*].name");
    const events: QueryWatchSnapshot[] = [];

    watch.subscribe((snapshot) => {
      events.push(snapshot);
    });
    watch.dispose();

    expect(doc.patch({ op: "replace", path: "/items/0/name", value: "A1" })).toEqual({ ok: true });

    expect(events).toEqual([]);
    expect(watch.current()).toMatchObject({
      ok: true,
      values: ["A", "B"],
    });
  });
});
