import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  canDocumentSchemaAccepts,
  describeDocumentSchema,
  planDocumentSchemaAcceptsResult,
  planDocumentSchemaResolution,
  queryDocumentSchema,
  readDocumentSchemaKind,
  type DocumentSchemaContext,
} from "../../../src/application/document/schema.js";

const Schema = z.object({
  title: z.string().min(1),
  items: z.array(z.object({ id: z.string(), done: z.boolean() })),
  meta: z.record(z.string(), z.object({ label: z.string() })),
  blocks: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string() }),
    z.object({ kind: z.literal("image"), src: z.string() }),
  ])),
});

describe("document schema core functions", () => {
  const context: DocumentSchemaContext<typeof Schema> = { schema: Schema };

  test("queries schema descriptions without a document facade", () => {
    expect(queryDocumentSchema(context, "")).toMatchObject({
      ok: true,
      path: "",
      mode: "value",
      kind: "object",
      description: {
        kind: "object",
        keys: ["title", "items", "meta", "blocks"],
      },
    });

    const title = describeDocumentSchema(context, "/title");
    expect(title).toMatchObject({ ok: true, path: "/title", mode: "value" });
    if (title.ok) {
      expect(JSON.parse(JSON.stringify(title.description))).toEqual(title.description);
      expect(title.description.jsonSchema).toMatchObject({ type: "string" });
    }
  });

  test("reads schema kinds for array insert, record value, and discriminated unions", () => {
    expect(readDocumentSchemaKind(context, "/items", "insert")).toEqual({
      ok: true,
      path: "/items",
      mode: "insert",
      kind: "object",
    });
    expect(readDocumentSchemaKind(context, "/meta")).toEqual({
      ok: true,
      path: "/meta",
      mode: "value",
      kind: "record",
    });
    expect(readDocumentSchemaKind(context, "/meta/secondary")).toEqual({
      ok: true,
      path: "/meta/secondary",
      mode: "value",
      kind: "object",
    });
    expect(describeDocumentSchema(context, "/blocks/0")).toMatchObject({
      ok: true,
      description: {
        kind: "discriminatedUnion",
        discriminator: "kind",
        allowed: ["text", "image"],
      },
    });
  });

  test("checks whether a schema path accepts a value", () => {
    expect(canDocumentSchemaAccepts(context, "/title", "final")).toEqual({ ok: true });
    expect(canDocumentSchemaAccepts(context, "/items", { id: "b", done: true }, "insert")).toEqual({ ok: true });

    const failed = canDocumentSchemaAccepts(context, "/items", { id: "b" }, "insert");

    expect(failed).toMatchObject({ ok: false, code: "schema_violation" });
    if (!failed.ok) {
      expect(failed.violations).toEqual([{ path: "/items/done", message: expect.any(String) }]);
    }
  });

  test("plans accepts results from zod parse output without resolving a document schema", () => {
    const Item = z.object({ id: z.string(), done: z.boolean() });

    expect(planDocumentSchemaAcceptsResult({
      path: "/items",
      result: Item.safeParse({ id: "b", done: true }),
    })).toEqual({ ok: true });

    const failed = planDocumentSchemaAcceptsResult({
      path: "/items",
      result: Item.safeParse({ id: "b" }),
    });

    expect(failed).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    if (!failed.ok) {
      expect(failed.violations).toEqual([{ path: "/items/done", message: expect.any(String) }]);
      expect(failed.reason).toContain("\"done\"");
    }
  });

  test("plans schema path resolution before query and accepts mapping", () => {
    const insertItem = planDocumentSchemaResolution({
      schema: Schema,
      path: "/items",
      mode: "insert",
    });
    expect(insertItem).toMatchObject({ ok: true });
    if (insertItem.ok) {
      expect(insertItem.schema.safeParse({ id: "a", done: false }).success).toBe(true);
      expect(insertItem.schema.safeParse([{ id: "a", done: false }]).success).toBe(false);
    }

    const recordValue = planDocumentSchemaResolution({
      schema: Schema,
      path: "/meta/secondary",
      mode: "value",
    });
    expect(recordValue).toMatchObject({ ok: true });
    if (recordValue.ok) {
      expect(recordValue.schema.safeParse({ label: "Secondary" }).success).toBe(true);
      expect(recordValue.schema.safeParse({ title: "Secondary" }).success).toBe(false);
    }

    expect(planDocumentSchemaResolution({
      schema: Schema,
      path: "title",
      mode: "value",
    })).toEqual({
      ok: false,
      code: "invalid_pointer",
      reason: "invalid schema pointer: title",
      pointer: "title",
    });

    expect(planDocumentSchemaResolution({
      schema: Schema,
      path: "/missing",
      mode: "value",
    })).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "schema path not found: /missing",
      pointer: "/missing",
    });
  });

  test("reports invalid and unknown schema paths", () => {
    expect(readDocumentSchemaKind(context, "title")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "title",
    });
    expect(readDocumentSchemaKind(context, "/missing")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "schema path not found: /missing",
      pointer: "/missing",
    });
    expect(canDocumentSchemaAccepts(context, "title", "final")).toEqual({
      ok: false,
      code: "invalid_pointer",
      reason: "invalid schema pointer: title",
      pointer: "title",
    });
  });
});
