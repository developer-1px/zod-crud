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
  meta: z.object({
    title: z.string(),
  }),
});

function createDoc() {
  return createJSONDocument(Schema, {
    items: [
      { id: "a", name: "A", done: false },
      { id: "b", name: "B", done: true },
    ],
    meta: {
      title: "List",
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
