import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../../../src/index.js";

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

  test("reports public schema kinds for scalar, union, optional, nullable, and unsupported JSON schema nodes", () => {
    const KindsSchema = z.object({
      n: z.number(),
      ok: z.boolean(),
      none: z.null(),
      literal: z.literal("x"),
      choice: z.enum(["a", "b"]),
      union: z.union([z.string(), z.number()]),
      optional: z.string().optional(),
      nullable: z.string().nullable(),
      any: z.any(),
      transformed: z.string().transform((value) => value),
    });
    const doc = createJSONDocument(KindsSchema, {
      n: 1,
      ok: true,
      none: null,
      literal: "x",
      choice: "a",
      union: "u",
      nullable: null,
      any: { nested: true },
      transformed: "t",
    });

    expect(doc.schema.kind("/n")).toMatchObject({ ok: true, kind: "number" });
    expect(doc.schema.kind("/ok")).toMatchObject({ ok: true, kind: "boolean" });
    expect(doc.schema.kind("/none")).toMatchObject({ ok: true, kind: "null" });
    expect(doc.schema.kind("/literal")).toMatchObject({ ok: true, kind: "literal" });
    expect(doc.schema.kind("/choice")).toMatchObject({ ok: true, kind: "enum" });
    expect(doc.schema.kind("/union")).toMatchObject({ ok: true, kind: "union" });
    expect(doc.schema.kind("/optional")).toMatchObject({ ok: true, kind: "optional" });
    expect(doc.schema.kind("/nullable")).toMatchObject({ ok: true, kind: "nullable" });
    expect(doc.schema.kind("/any")).toMatchObject({ ok: true, kind: "any" });

    const transformed = doc.schema.describe("/transformed");
    expect(transformed).toMatchObject({
      ok: true,
      description: {
        kind: "unknown",
        jsonSchema: null,
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
    expect(doc.schema.accepts("title", "final")).toEqual({
      ok: false,
      code: "invalid_pointer",
      reason: "invalid schema pointer: title",
      pointer: "title",
    });
    expect(doc.schema.accepts("/missing", "final")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "schema path not found: /missing",
      pointer: "/missing",
    });
  });
});
