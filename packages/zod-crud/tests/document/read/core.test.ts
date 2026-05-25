import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  buildReadFacade,
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
    const read = buildReadFacade({ schema: Schema, getState: () => initial });

    expect(read.at("")).toEqual({ ok: true, path: "", value: initial });
    expect(read.at("/tasks/0/name")).toEqual({
      ok: true,
      path: "/tasks/0/name",
      value: "A",
    });
    expect(read.at("tasks/0")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "tasks/0",
    });
    expect(read.at("/tasks/9")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "path not found: /tasks/9",
      pointer: "/tasks/9",
    });
  });

  test("queries JSONPath pointers from plain state", () => {
    const read = buildReadFacade({ schema: Schema, getState: () => initial });

    expect(read.query("$.tasks[*].id")).toEqual({
      ok: true,
      query: "$.tasks[*].id",
      pointers: ["/tasks/0/id", "/tasks/1/id"],
    });
    expect(read.query("$..label")).toEqual({
      ok: true,
      query: "$..label",
      pointers: ["/meta/primary/label", "/meta/secondary/label"],
    });
    expect(read.query("$.tasks[")).toMatchObject({
      ok: false,
      code: "invalid_query",
    });
  });

  test("lists root, object, array, record, and primitive entries", () => {
    const read = buildReadFacade({ schema: Schema, getState: () => initial });

    expect(read.entries("")).toMatchObject({
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
    expect(read.entries("/nested")).toEqual({
      ok: true,
      path: "/nested",
      kind: "object",
      entries: [{ key: "flag", path: "/nested/flag", value: true }],
    });
    expect(read.entries("/tasks")).toMatchObject({
      ok: true,
      path: "/tasks",
      kind: "array",
      entries: [
        { key: "0", path: "/tasks/0", value: { id: "a", name: "A" } },
        { key: "1", path: "/tasks/1", value: { id: "b", name: "B" } },
      ],
    });
    expect(read.entries("/meta")).toMatchObject({
      ok: true,
      path: "/meta",
      kind: "record",
      entries: [
        { key: "primary", path: "/meta/primary", value: { label: "Primary" } },
        { key: "secondary", path: "/meta/secondary", value: { label: "Secondary" } },
      ],
    });
    expect(read.entries("/title")).toEqual({
      ok: true,
      path: "/title",
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
    const read = buildReadFacade({ schema: EscapedSchema, getState: () => state });

    expect(read.entries("/meta")).toEqual({
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
