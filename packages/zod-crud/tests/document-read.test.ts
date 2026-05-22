import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

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

describe("doc read/query facade", () => {
  test("reads pointers and reports existence", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.at("")).toEqual({ ok: true, path: "", value: initial });
    expect(doc.at("/tasks/0/name")).toEqual({ ok: true, path: "/tasks/0/name", value: "A" });
    expect(doc.exists("/tasks/1")).toBe(true);
    expect(doc.exists("/tasks/9")).toBe(false);
    expect(doc.exists("tasks/0")).toBe(false);
    expect(doc.at("tasks/0")).toMatchObject({ ok: false, code: "invalid_pointer", pointer: "tasks/0" });
    expect(doc.at("/tasks/9")).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "path not found: /tasks/9",
      pointer: "/tasks/9",
    });
  });

  test("lists root, object, array, record, and primitive entries", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.entries("")).toMatchObject({
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
    expect(doc.entries("/nested")).toEqual({
      ok: true,
      path: "/nested",
      kind: "object",
      entries: [{ key: "flag", path: "/nested/flag", value: true }],
    });
    expect(doc.entries("/tasks")).toMatchObject({
      ok: true,
      path: "/tasks",
      kind: "array",
      entries: [
        { key: "0", path: "/tasks/0", value: { id: "a", name: "A" } },
        { key: "1", path: "/tasks/1", value: { id: "b", name: "B" } },
      ],
    });
    expect(doc.entries("/meta")).toMatchObject({
      ok: true,
      path: "/meta",
      kind: "record",
      entries: [
        { key: "primary", path: "/meta/primary", value: { label: "Primary" } },
        { key: "secondary", path: "/meta/secondary", value: { label: "Secondary" } },
      ],
    });
    expect(doc.entries("/title")).toEqual({
      ok: true,
      path: "/title",
      kind: "primitive",
      entries: [],
    });
  });

  test("returns JSONPath query pointers and invalid query errors", () => {
    const doc = createJSONDocument(Schema, initial);

    expect(doc.query("$.tasks[*].id")).toEqual({
      ok: true,
      query: "$.tasks[*].id",
      pointers: ["/tasks/0/id", "/tasks/1/id"],
    });
    expect(doc.query("$..label")).toEqual({
      ok: true,
      query: "$..label",
      pointers: ["/meta/primary/label", "/meta/secondary/label"],
    });
    expect(doc.query("$.tasks[")).toMatchObject({ ok: false, code: "invalid_query" });
  });

  test("reads the current document state after edits", () => {
    const doc = createJSONDocument(Schema, initial, { history: 10 });

    doc.patch({ op: "replace", path: "/title", value: "final" });

    expect(doc.at("/title")).toEqual({ ok: true, path: "/title", value: "final" });
    const rootEntries = doc.entries("");
    expect(rootEntries.ok).toBe(true);
    if (rootEntries.ok) {
      expect(rootEntries.entries[0]).toEqual({ key: "title", path: "/title", value: "final" });
    }
  });
});
