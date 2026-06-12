import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";

const Item = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const Schema = z.object({
  items: z.array(Item),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

describe("validation violation paths", () => {
  test("schema.accepts anchors violations to the requested schema pointer", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.schema.accepts("/items/0", { id: "", name: "A" })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/0/id", message: expect.any(String) }],
    });
    expect(doc.schema.accepts("/items", { id: "", name: "C" }, "insert")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/id", message: expect.any(String) }],
    });
    expect(doc.schema.accepts("/items/-", { id: "", name: "C" }, "insert")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/-/id", message: expect.any(String) }],
    });
  });

  test("schema.accepts reports root issues as the empty JSON Pointer", () => {
    const RootSchema = z.object({ title: z.string() }).superRefine((value, ctx) => {
      if (value.title === "bad") ctx.addIssue({ code: "custom", message: "root issue" });
    });
    const doc = createJSONDocument(RootSchema, { title: "ok" });

    expect(doc.schema.accepts("", { title: "bad" })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "", message: "root issue" }],
    });
  });

  test("canPatch anchors violations to preview document paths", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.canPatch({ op: "replace", path: "/items/0/id", value: "" })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/0/id", message: expect.any(String) }],
    });
    expect(doc.canPatch({ op: "add", path: "/items/-", value: { id: "", name: "C" } })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/2/id", message: expect.any(String) }],
    });
  });

  test("canPaste direct payload anchors after replace and spread violations to result paths", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.canPaste({ after: "/items/0" }, { payload: { id: "", name: "C" } })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/1/id", message: expect.any(String) }],
    });
    expect(doc.canPaste({ replace: "/items/0" }, { payload: { id: "", name: "C" } })).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/0/id", message: expect.any(String) }],
    });

    const spread = doc.canPaste("/items/-", {
      payload: [
        { id: "", name: "C" },
        { id: "", name: "D" },
      ],
      spread: true,
    });
    expect(spread).toMatchObject({ ok: false, code: "schema_violation" });
    if (!spread.ok) {
      expect(spread.violations).toEqual([
        { path: "/items/2/id", message: expect.any(String) },
        { path: "/items/3/id", message: expect.any(String) },
      ]);
    }
  });

  test("clipboard paste preserves direct payload violation paths", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.clipboard.write({ id: "", name: "C" })).toEqual({ ok: true });
    expect(doc.canPaste("/items/-")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/2/id", message: expect.any(String) }],
    });
    expect(doc.clipboard.paste("/items/-")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/2/id", message: expect.any(String) }],
    });
  });

  test("canDuplicate and duplicate preserve result-path violations", () => {
    const UniqueSchema = z.object({
      items: z.array(z.object({ id: z.string(), name: z.string() })),
    }).superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.items.forEach((item, index) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "id"],
            message: "duplicate id",
          });
        }
        seen.add(item.id);
      });
    });
    const doc = createJSONDocument(UniqueSchema, { items: [{ id: "a", name: "A" }] });

    expect(doc.canDuplicate("/items/0")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/1/id", message: "duplicate id" }],
    });
    expect(doc.duplicate("/items/0")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [{ path: "/items/1/id", message: "duplicate id" }],
    });
    expect(doc.value).toEqual({ items: [{ id: "a", name: "A" }] });
  });

  test("discriminator mismatch results do not expose schema violations", () => {
    const BlockSchema = z.object({
      blocks: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text"), text: z.string() }),
        z.object({ kind: z.literal("image"), src: z.string() }),
      ])),
    });
    const doc = createJSONDocument(BlockSchema, {
      blocks: [{ kind: "text", text: "hello" }],
    });

    const result = doc.canPaste("/blocks/-", { payload: { kind: "video", src: "bad" } });

    expect(result).toMatchObject({
      ok: false,
      code: "discriminator_mismatch",
    });
    if (!result.ok) expect(result).not.toHaveProperty("violations");
  });
});
