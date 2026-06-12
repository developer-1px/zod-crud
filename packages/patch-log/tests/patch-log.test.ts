import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument, type JSONChangeMetadata, type JSONPatchOperation } from "@interactive-os/json-document";
import { createPatchLog } from "../src/index.js";

const Item = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

const State = z.object({
  title: z.string(),
  items: z.array(Item),
});

function createDoc(
  initial = {
    title: "Board",
    items: [
      { id: "a", title: "A", done: false },
      { id: "b", title: "B", done: false },
    ],
  },
) {
  return createJSONDocument(State, initial, {
    history: 10,
  });
}

describe("@interactive-os/json-document-patch-log", () => {
  test("records applied patches and metadata from document subscriptions", () => {
    const doc = createDoc();
    const log = createPatchLog(doc);

    expect(doc.patch({
      op: "replace",
      path: "/items/0",
      value: { id: "a", title: "A1", done: true },
    }, {
      label: "replace item",
      origin: "test",
    })).toEqual({ ok: true });

    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]).toMatchObject({
      applied: [
        {
          op: "replace",
          path: "/items/0",
          value: { id: "a", title: "A1", done: true },
        },
      ],
      metadata: {
        label: "replace item",
        origin: "test",
      },
    });
  });

  test("returns defensive copies of entries, patches, and metadata", () => {
    const doc = createDoc();
    const log = createPatchLog(doc);

    expect(doc.patch({
      op: "replace",
      path: "/items/0",
      value: { id: "a", title: "A1", done: true },
    }, {
      label: "replace item",
    })).toEqual({ ok: true });

    const entry = log.entries()[0];
    if (entry === undefined) throw new Error("expected patch log entry");
    const operation = entry?.applied[0];
    if (operation?.op !== "replace") throw new Error("expected replace operation");

    (operation.value as { title: string }).title = "mutated";
    (entry.metadata as JSONChangeMetadata).label = "mutated";

    expect(log.entries()[0]).toMatchObject({
      applied: [
        {
          op: "replace",
          path: "/items/0",
          value: { id: "a", title: "A1", done: true },
        },
      ],
      metadata: {
        label: "replace item",
      },
    });
  });

  test("pauses, resumes, clears, and disposes without plugin registration", () => {
    const doc = createDoc();
    const log = createPatchLog(doc);

    log.pause();
    expect(doc.patch({ op: "replace", path: "/title", value: "Paused" })).toEqual({ ok: true });
    expect(log.entries()).toEqual([]);

    log.resume();
    expect(doc.patch({ op: "replace", path: "/title", value: "Recorded" })).toEqual({ ok: true });
    expect(log.entries()).toHaveLength(1);

    log.clear();
    expect(log.entries()).toEqual([]);

    expect(doc.patch({ op: "replace", path: "/title", value: "After clear" })).toEqual({ ok: true });
    expect(log.entries()).toHaveLength(1);

    log.dispose();
    expect(doc.patch({ op: "replace", path: "/title", value: "After dispose" })).toEqual({ ok: true });
    expect(log.entries()).toHaveLength(1);
  });

  test("replays recorded patches into another compatible document", () => {
    const source = createDoc();
    const log = createPatchLog(source);
    const target = createDoc();
    const targetEvents: Array<{
      applied: ReadonlyArray<JSONPatchOperation>;
      metadata?: JSONChangeMetadata;
    }> = [];

    target.subscribe((applied, metadata) => {
      targetEvents.push({ applied, ...(metadata !== undefined ? { metadata } : {}) });
    });

    expect(source.patch([
      { op: "replace", path: "/title", value: "Next" },
      { op: "add", path: "/items/-", value: { id: "c", title: "C", done: true } },
    ], {
      label: "batch edit",
      origin: "test",
    })).toEqual({ ok: true });

    expect(log.replayInto(target)).toMatchObject({
      ok: true,
      appliedEntries: 1,
      steps: [
        {
          index: 0,
          result: { ok: true },
        },
      ],
    });
    expect(target.value).toEqual(source.value);
    expect(targetEvents[0]?.metadata).toMatchObject({
      label: "batch edit",
      origin: "test",
    });
  });

  test("can replay through commit with explicit commit options", () => {
    const source = createDoc();
    const log = createPatchLog(source);
    const target = createDoc();
    const originalCommit = target.commit.bind(target);
    const commitCalls: JSONChangeMetadata[] = [];

    target.commit = ((operations, options) => {
      if (options !== undefined) commitCalls.push(options);
      return originalCommit(operations, options);
    }) as typeof target.commit;

    expect(source.patch({ op: "replace", path: "/title", value: "Committed" })).toEqual({ ok: true });
    expect(log.replayInto(target, {
      mode: "commit",
      commitOptions: {
        label: "replay commit",
        origin: "programmatic",
      },
    })).toMatchObject({
      ok: true,
      appliedEntries: 1,
    });

    expect(target.value.title).toBe("Committed");
    expect(commitCalls).toEqual([
      {
        label: "replay commit",
        origin: "programmatic",
      },
    ]);
  });

  test("stops replay before applying an entry rejected by canPatch", () => {
    const source = createDoc();
    const log = createPatchLog(source);
    const target = createDoc({
      title: "Board",
      items: [
        { id: "a", title: "A", done: false },
      ],
    });

    expect(source.patch({ op: "replace", path: "/items/1/title", value: "B2" })).toEqual({ ok: true });

    expect(log.replayInto(target)).toMatchObject({
      ok: false,
      code: "cannot_patch",
      index: 0,
      appliedEntries: 0,
      capability: {
        ok: false,
      },
      steps: [],
    });
    expect(target.value.items).toEqual([
      { id: "a", title: "A", done: false },
    ]);
  });
});
