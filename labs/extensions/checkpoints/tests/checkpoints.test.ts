import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { createCheckpoints } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  cards: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    cards: [
      { id: "a", title: "A" },
    ],
  }, {
    history: 10,
  });
}

describe("@interactive-os/json-document-checkpoints", () => {
  test("saves and lists named checkpoints without mutating", () => {
    const doc = createDoc();
    let tick = 100;
    const checkpoints = createCheckpoints(doc, { now: () => tick++ });

    expect(checkpoints.save("start", { label: "Start" })).toEqual({
      ok: true,
      checkpoint: {
        key: "start",
        label: "Start",
        savedAt: 100,
        value: {
          title: "Draft",
          cards: [{ id: "a", title: "A" }],
        },
      },
    });
    expect(checkpoints.current()).toEqual({
      count: 1,
      entries: [
        {
          key: "start",
          label: "Start",
          savedAt: 100,
          value: {
            title: "Draft",
            cards: [{ id: "a", title: "A" }],
          },
        },
      ],
    });
    expect(doc.value.title).toBe("Draft");
  });

  test("restores a checkpoint through document load", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc, { now: () => 1 });

    checkpoints.save("start");
    expect(doc.replace("/title", "Changed")).toEqual({ ok: true });
    expect(doc.insert("/cards/-", { id: "b", title: "B" })).toEqual({ ok: true });

    expect(checkpoints.canRestore("start")).toEqual({ ok: true });
    expect(checkpoints.restore("start")).toMatchObject({
      ok: true,
      checkpoint: {
        key: "start",
        value: {
          title: "Draft",
          cards: [{ id: "a", title: "A" }],
        },
      },
      result: { ok: true },
    });
    expect(doc.value).toEqual({
      title: "Draft",
      cards: [{ id: "a", title: "A" }],
    });
  });

  test("can preserve or clear document history through load options", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc);

    checkpoints.save("start");
    doc.replace("/title", "Changed");
    expect(doc.canUndo()).toEqual({ ok: true });

    checkpoints.restore("start");
    expect(doc.canUndo()).toMatchObject({ ok: false, code: "empty_stack" });

    doc.replace("/title", "Changed again");
    checkpoints.restore("start", { preserveHistory: true });
    expect(doc.canUndo()).toEqual({ ok: true });
  });

  test("reports missing checkpoints", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc);

    expect(checkpoints.get("missing")).toEqual({
      ok: false,
      code: "missing_checkpoint",
      reason: "checkpoint not found: missing",
      key: "missing",
    });
    expect(checkpoints.restore("missing")).toMatchObject({
      ok: false,
      code: "missing_checkpoint",
      key: "missing",
    });
  });

  test("emits checkpoint set changes", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc, { now: () => 1 });
    const events: unknown[] = [];

    checkpoints.subscribe((snapshot) => events.push(snapshot));
    checkpoints.save("start");
    checkpoints.save("later", { label: "Later" });
    checkpoints.remove("start");
    checkpoints.clear();

    expect(events).toEqual([
      {
        count: 1,
        entries: [
          { key: "start", savedAt: 1, value: doc.value },
        ],
      },
      {
        count: 2,
        entries: [
          { key: "later", label: "Later", savedAt: 1, value: doc.value },
          { key: "start", savedAt: 1, value: doc.value },
        ],
      },
      {
        count: 1,
        entries: [
          { key: "later", label: "Later", savedAt: 1, value: doc.value },
        ],
      },
      {
        count: 0,
        entries: [],
      },
    ]);
  });

  test("returns isolated checkpoint values", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc, { now: () => 1 });

    const saved = checkpoints.save("start");
    saved.checkpoint.value.title = "Mutated";

    const read = checkpoints.get("start");
    if (!read.ok) throw new Error(read.reason);
    read.checkpoint.value.cards[0]!.title = "Mutated";

    expect(checkpoints.get("start")).toEqual({
      ok: true,
      checkpoint: {
        key: "start",
        savedAt: 1,
        value: {
          title: "Draft",
          cards: [{ id: "a", title: "A" }],
        },
      },
    });
    expect(doc.value.cards[0]?.title).toBe("A");
  });

  test("disposes subscriptions", () => {
    const doc = createDoc();
    const checkpoints = createCheckpoints(doc);
    const events: unknown[] = [];

    checkpoints.subscribe((snapshot) => events.push(snapshot));
    checkpoints.dispose();
    checkpoints.save("start");

    expect(events).toEqual([]);
  });
});
