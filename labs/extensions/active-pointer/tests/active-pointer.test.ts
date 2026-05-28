import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createActivePointer } from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
});
const Schema = z.object({
  cards: z.array(Card),
});

function createDoc() {
  return createJSONDocument(Schema, {
    cards: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
  });
}

describe("@zod-crud/active-pointer", () => {
  test("sets and reads an active pointer", () => {
    const doc = createDoc();
    const active = createActivePointer(doc);

    expect(active.current()).toEqual({ pointer: null, lost: false });
    expect(active.canSet("/cards/1")).toEqual({ ok: true });
    expect(active.set("/cards/1")).toEqual({
      ok: true,
      snapshot: { pointer: "/cards/1", lost: false },
    });
    expect(active.value()).toEqual({
      ok: true,
      pointer: "/cards/1",
      value: { id: "b", title: "B" },
    });
  });

  test("tracks active pointer through array insertions", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/1");
    const snapshots: unknown[] = [];
    active.subscribe((snapshot) => snapshots.push(snapshot));

    expect(doc.insert("/cards/0", { id: "x", title: "X" })).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: "/cards/2", lost: false });
    expect(active.value()).toMatchObject({
      ok: true,
      value: { id: "b", title: "B" },
    });
    expect(snapshots).toEqual([{ pointer: "/cards/2", lost: false }]);
  });

  test("recovers deleted active item to the next sibling", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/1");

    expect(doc.delete("/cards/1")).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: "/cards/1", lost: false });
    expect(active.value()).toMatchObject({
      ok: true,
      value: { id: "c", title: "C" },
    });
  });

  test("recovers deleted last item to the previous sibling", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/2");

    expect(doc.delete("/cards/2")).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: "/cards/1", lost: false });
    expect(active.value()).toMatchObject({
      ok: true,
      value: { id: "b", title: "B" },
    });
  });

  test("can leave deleted active item as lost when recovery is disabled", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/1", { recover: false });

    expect(doc.delete("/cards/1")).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: null, lost: true });
    expect(active.value()).toMatchObject({
      ok: false,
      code: "empty_active",
      reason: "active pointer was lost",
    });
  });

  test("falls back to parent when a descendant is replaced", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/0/title");

    expect(doc.replace("/cards/0", { id: "a2", title: "A2" })).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: "/cards/0", lost: false });
    expect(active.value()).toMatchObject({
      ok: true,
      value: { id: "a2", title: "A2" },
    });
  });

  test("marks active pointer lost after root replacement removes its parent", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/1");

    expect(doc.patch({ op: "replace", path: "", value: { cards: [] } })).toEqual({ ok: true });

    expect(active.current()).toEqual({ pointer: null, lost: true });
  });

  test("reports invalid and missing active targets", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/missing");

    expect(active.current()).toEqual({ pointer: null, lost: true });
    expect(active.canSet("cards/1")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "cards/1",
    });
    expect(active.set("/missing")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });

  test("returns isolated active values", () => {
    const doc = createDoc();
    const active = createActivePointer(doc, "/cards/0");

    const value = active.value();
    if (!value.ok) throw new Error(value.reason);
    (value.value as { title: string }).title = "Changed";

    expect(active.value()).toEqual({
      ok: true,
      pointer: "/cards/0",
      value: { id: "a", title: "A" },
    });
    expect(doc.value.cards[0]?.title).toBe("A");
  });
});
