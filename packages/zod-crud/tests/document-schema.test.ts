import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

const Schema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({ id: z.string(), done: z.boolean() })),
  meta: z.record(z.string(), z.object({ label: z.string() })),
  blocks: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string() }),
    z.object({ kind: z.literal("image"), src: z.string() }),
  ])),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  items: [{ id: "a", done: false }],
  meta: { primary: { label: "Primary" } },
  blocks: [{ kind: "text", text: "Hello" }],
};

describe("doc.schema — schema introspection facade", () => {
  test("describes root and object properties without exposing Zod internals", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.schema.at("")).toMatchObject({
      ok: true,
      path: "",
      mode: "value",
      kind: "object",
      description: {
        kind: "object",
        keys: ["title", "items", "meta", "blocks"],
      },
    });
    expect(doc.schema.kind("/title")).toEqual({
      ok: true,
      path: "/title",
      mode: "value",
      kind: "string",
    });
    const described = doc.schema.describe("/title");
    expect(described).toMatchObject({ ok: true, path: "/title", mode: "value" });
    if (described.ok) {
      expect(JSON.parse(JSON.stringify(described.description))).toEqual(described.description);
      expect(described.description.jsonSchema).toMatchObject({ type: "string" });
    }
  });

  test("answers array insert, record value, and discriminated union paths", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.schema.kind("/items", "insert")).toEqual({
      ok: true,
      path: "/items",
      mode: "insert",
      kind: "object",
    });
    expect(doc.schema.kind("/meta")).toEqual({
      ok: true,
      path: "/meta",
      mode: "value",
      kind: "record",
    });
    expect(doc.schema.kind("/meta/secondary")).toEqual({
      ok: true,
      path: "/meta/secondary",
      mode: "value",
      kind: "object",
    });
    expect(doc.schema.describe("/blocks/0")).toMatchObject({
      ok: true,
      description: {
        kind: "discriminatedUnion",
        discriminator: "kind",
        allowed: ["text", "image"],
      },
    });
  });

  test("checks whether a path accepts a value without mutating the document", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.schema.accepts("/title", "final")).toEqual({ ok: true });
    expect(doc.schema.accepts("/items", { id: "b", done: true }, "insert")).toEqual({ ok: true });

    const failed = doc.schema.accepts("/items", { id: "b" }, "insert");

    expect(failed).toMatchObject({ ok: false, code: "schema_violation" });
    if (!failed.ok) {
      expect(failed.violations).toEqual([{ path: "/items/done", message: expect.any(String) }]);
    }
    expect(doc.value).toEqual(initial);
  });

  test("reports invalid and unknown schema paths", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.schema.kind("title")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "title",
    });
    expect(doc.schema.kind("/missing")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "schema path not found: /missing",
      pointer: "/missing",
    });
  });
});
