import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  planDocumentEntries,
  queryDocumentPointers,
  readDocumentEntries,
  readDocumentPointer,
  type DocumentReadContext,
} from "../../../src/application/document/read.js";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.object({ label: z.string() })),
  nested: z.object({ flag: z.boolean() }),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  tasks: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: {
    primary: { label: "Primary" },
    secondary: { label: "Secondary" },
  },
  nested: { flag: true },
};

describe("document read core functions", () => {
  test("reads pointers from plain state without a document facade", () => {
    expect(readDocumentPointer(initial, "")).toEqual({ ok: true, path: "", value: initial });
    expect(readDocumentPointer(initial, "/tasks/0/name")).toEqual({
      ok: true,
      path: "/tasks/0/name",
      value: "A",
    });
    expect(readDocumentPointer(initial, "tasks/0")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "tasks/0",
    });
    expect(readDocumentPointer(initial, "/tasks/9")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "path not found: /tasks/9",
      pointer: "/tasks/9",
    });
  });

  test("queries JSONPath pointers from plain state", () => {
    expect(queryDocumentPointers(initial, "$.tasks[*].id")).toEqual({
      ok: true,
      query: "$.tasks[*].id",
      pointers: ["/tasks/0/id", "/tasks/1/id"],
    });
    expect(queryDocumentPointers(initial, "$..label")).toEqual({
      ok: true,
      query: "$..label",
      pointers: ["/meta/primary/label", "/meta/secondary/label"],
    });
    expect(queryDocumentPointers(initial, "$.tasks[")).toMatchObject({
      ok: false,
      code: "invalid_query",
    });
  });

  test("lists root, object, array, record, and primitive entries", () => {
    const context: DocumentReadContext<typeof Schema> = { schema: Schema, state: initial };

    expect(readDocumentEntries(context, "")).toMatchObject({
      ok: true,
      path: "",
      kind: "root",
      entries: [
        { key: "title", path: "/title", value: "draft" },
        { key: "tasks", path: "/tasks" },
        { key: "meta", path: "/meta" },
        { key: "nested", path: "/nested", value: { flag: true } },
      ],
    });
    expect(readDocumentEntries(context, "/nested")).toEqual({
      ok: true,
      path: "/nested",
      kind: "object",
      entries: [{ key: "flag", path: "/nested/flag", value: true }],
    });
    expect(readDocumentEntries(context, "/tasks")).toMatchObject({
      ok: true,
      path: "/tasks",
      kind: "array",
      entries: [
        { key: "0", path: "/tasks/0", value: { id: "a", name: "A" } },
        { key: "1", path: "/tasks/1", value: { id: "b", name: "B" } },
      ],
    });
    expect(readDocumentEntries(context, "/meta")).toMatchObject({
      ok: true,
      path: "/meta",
      kind: "record",
      entries: [
        { key: "primary", path: "/meta/primary", value: { label: "Primary" } },
        { key: "secondary", path: "/meta/secondary", value: { label: "Secondary" } },
      ],
    });
    expect(readDocumentEntries(context, "/title")).toEqual({
      ok: true,
      path: "/title",
      kind: "primitive",
      entries: [],
    });
  });

  test("plans entry kind and child entries without reading from document state", () => {
    expect(planDocumentEntries({
      schema: Schema,
      path: "",
      value: initial,
    })).toMatchObject({
      kind: "root",
      entries: [
        { key: "title", path: "/title" },
        { key: "tasks", path: "/tasks" },
        { key: "meta", path: "/meta" },
        { key: "nested", path: "/nested" },
      ],
    });

    expect(planDocumentEntries({
      schema: Schema,
      path: "/meta",
      value: initial.meta,
    })).toMatchObject({
      kind: "record",
      entries: [
        { key: "primary", path: "/meta/primary", value: { label: "Primary" } },
        { key: "secondary", path: "/meta/secondary", value: { label: "Secondary" } },
      ],
    });

    expect(planDocumentEntries({
      schema: Schema,
      path: "/nested",
      value: initial.nested,
    })).toEqual({
      kind: "object",
      entries: [{ key: "flag", path: "/nested/flag", value: true }],
    });

    expect(planDocumentEntries({
      schema: Schema,
      path: "/title",
      value: initial.title,
    })).toEqual({
      kind: "primitive",
      entries: [],
    });
  });

  test("escapes object keys when listing child entries", () => {
    const EscapedSchema = z.object({
      meta: z.record(z.string(), z.string()),
    });
    const state: z.output<typeof EscapedSchema> = {
      meta: {
        "a/b": "slash",
        "tilde~key": "tilde",
      },
    };

    expect(readDocumentEntries({ schema: EscapedSchema, state }, "/meta")).toEqual({
      ok: true,
      path: "/meta",
      kind: "record",
      entries: [
        { key: "a/b", path: "/meta/a~1b", value: "slash" },
        { key: "tilde~key", path: "/meta/tilde~0key", value: "tilde" },
      ],
    });
  });
});
