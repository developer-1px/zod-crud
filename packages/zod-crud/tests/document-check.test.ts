import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.string()),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { owner: "core" },
};

describe("JSONDocument can* interface", () => {
  test("reports patch, read, and mutation capabilities with reasons", () => {
    const doc = createJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    });

    expect(doc.canFind("$.items[*].id")).toEqual({ ok: true });
    expect(doc.canFind("$.items[")).toMatchObject({ ok: false, code: "syntax_error" });
    expect(doc.canPatch({ op: "replace", path: "/items/0/name", value: "A1" })).toEqual({ ok: true });
    expect(doc.canPatch({ op: "replace", path: "items/0/name", value: "A1" })).toMatchObject({
      ok: false,
      code: "invalid_pointer",
    });
    expect(doc.canReplace("/items/0/name", 1)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.canRemove("/items/0")).toEqual({ ok: true });
    expect(doc.canCopy("/items/99")).toMatchObject({ ok: false, code: "path_not_found" });
    expect(doc.canCut("/items/0")).toEqual({ ok: true });
    expect(doc.canPastePayload("/items/-", { id: "c", name: "C" })).toEqual({ ok: true });
  });

  test("tracks history capabilities through flat can* methods", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.canUndo()).toMatchObject({ ok: false, code: "empty_stack" });
    expect(doc.canRedo()).toMatchObject({ ok: false, code: "empty_stack" });

    doc.patch({ op: "replace", path: "/items/0/name", value: "A1" });

    expect(doc.canUndo()).toEqual({ ok: true });
    expect(doc.canRedo()).toMatchObject({ ok: false, code: "empty_stack" });

    expect(doc.history.undo()).toBe(true);
    expect(doc.canRedo()).toEqual({ ok: true });
  });

  test("does not mutate the document while checking capabilities", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    expect(doc.canPastePayload("/items/-", { id: 1, name: "C" })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.value).toEqual(initial);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("reports spread paste discriminated union mismatch before commit", () => {
    const BlockSchema = z.object({
      blocks: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text"), text: z.string() }),
        z.object({ kind: z.literal("image"), src: z.string() }),
      ])),
    });
    const doc = createJSONDocument(BlockSchema, {
      blocks: [{ kind: "text", text: "hello" }],
    }, { history: 10 });

    const payload = [
      { kind: "text", text: "ok" },
      { kind: "video", src: "bad" },
    ];

    expect(doc.canPastePayload("/blocks/-", payload, { spread: true })).toMatchObject({
      ok: false,
      code: "du_branch_mismatch",
    });
    expect(doc.clipboard.pastePayload("/blocks/-", payload, { spread: true })).toMatchObject({
      ok: false,
      code: "du_branch_mismatch",
      source: { discriminator: "kind", value: "video" },
    });
    expect(doc.value.blocks).toEqual([{ kind: "text", text: "hello" }]);
  });
});
