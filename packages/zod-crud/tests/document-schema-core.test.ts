import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  checkDocumentSchemaAccepts,
  describeDocumentSchema,
  queryDocumentSchema,
  readDocumentSchemaKind,
  type DocumentSchemaContext,
} from "../src/application/document/schema.js";

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
    expect(checkDocumentSchemaAccepts(context, "/title", "final")).toEqual({ ok: true });
    expect(checkDocumentSchemaAccepts(context, "/items", { id: "b", done: true }, "insert")).toEqual({ ok: true });

    const failed = checkDocumentSchemaAccepts(context, "/items", { id: "b" }, "insert");

    expect(failed).toMatchObject({ ok: false, code: "schema_violation" });
    if (!failed.ok) {
      expect(failed.violations).toEqual([{ path: "/items/done", message: expect.any(String) }]);
    }
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
    expect(checkDocumentSchemaAccepts(context, "title", "final")).toEqual({
      ok: false,
      code: "invalid_pointer",
      reason: "invalid schema pointer: title",
      pointer: "title",
    });
  });
});
