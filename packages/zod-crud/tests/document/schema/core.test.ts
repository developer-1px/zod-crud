import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  createSchemaState,
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
  test("queries schema descriptions without a document facade", () => {
    const schema = createSchemaState({ schema: Schema });

    expect(schema.at("")).toMatchObject({
      ok: true,
      path: "",
      mode: "value",
      kind: "object",
      description: {
        kind: "object",
        keys: ["title", "items", "meta", "blocks"],
      },
    });

    const title = schema.describe("/title");
    expect(title).toMatchObject({ ok: true, path: "/title", mode: "value" });
    if (title.ok) {
      expect(JSON.parse(JSON.stringify(title.description))).toEqual(title.description);
      expect(title.description.jsonSchema).toMatchObject({ type: "string" });
    }
  });

  test("reads schema kinds for array insert, record value, and discriminated unions", () => {
    const schema = createSchemaState({ schema: Schema });

    expect(schema.kind("/items", "insert")).toEqual({
      ok: true,
      path: "/items",
      mode: "insert",
      kind: "object",
    });
    expect(schema.kind("/meta")).toEqual({
      ok: true,
      path: "/meta",
      mode: "value",
      kind: "record",
    });
    expect(schema.kind("/meta/secondary")).toEqual({
      ok: true,
      path: "/meta/secondary",
      mode: "value",
      kind: "object",
    });
    expect(schema.describe("/blocks/0")).toMatchObject({
      ok: true,
      description: {
        kind: "discriminatedUnion",
        discriminator: "kind",
        allowed: ["text", "image"],
      },
    });
  });

  test("checks whether a schema path accepts a value", () => {
    const schema = createSchemaState({ schema: Schema });

    expect(schema.accepts("/title", "final")).toEqual({ ok: true });
    expect(schema.accepts("/items", { id: "b", done: true }, "insert")).toEqual({ ok: true });

    const failed = schema.accepts("/items", { id: "b" }, "insert");

    expect(failed).toMatchObject({ ok: false, code: "schema_violation" });
    if (!failed.ok) {
      expect(failed.violations).toEqual([{ path: "/items/done", message: expect.any(String) }]);
    }
  });

  test("reports invalid and unknown schema paths", () => {
    const schema = createSchemaState({ schema: Schema });

    expect(schema.kind("title")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "title",
    });
    expect(schema.kind("/missing")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "schema path not found: /missing",
      pointer: "/missing",
    });
    expect(schema.accepts("title", "final")).toEqual({
      ok: false,
      code: "invalid_pointer",
      reason: "invalid schema pointer: title",
      pointer: "title",
    });
  });

  test("exposes allowed for every closed value set: enum, literal, discriminatedUnion", () => {
    const ClosedSets = z.object({
      status: z.enum(["todo", "doing", "done"]),
      flag: z.literal("on"),
      blocks: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("text") }),
        z.object({ kind: z.literal("image") }),
      ])),
    });
    const schema = createSchemaState({ schema: ClosedSets });

    const status = schema.describe("/status");
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.description.kind).toBe("enum");
      expect(status.description.allowed).toEqual(["todo", "doing", "done"]);
    }

    const flag = schema.describe("/flag");
    expect(flag.ok).toBe(true);
    if (flag.ok) {
      expect(flag.description.kind).toBe("literal");
      expect(flag.description.allowed).toEqual(["on"]);
    }

    const block = schema.describe("/blocks/0");
    expect(block.ok).toBe(true);
    if (block.ok) {
      expect(block.description.kind).toBe("discriminatedUnion");
      expect(block.description.allowed).toEqual(["text", "image"]);
    }
  });
});
