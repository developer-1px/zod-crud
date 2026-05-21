import { describe, expect, test } from "vitest";
import * as z from "zod";

import { buildReadFacade } from "../src/read.js";
import { createSchemaState } from "../src/schema.js";

const Schema = z.object({
  title: z.string(),
  items: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

const initial: z.output<typeof Schema> = {
  title: "Board",
  items: [
    { id: "a", done: false },
    { id: "b", done: true },
  ],
};

describe("headless read and schema facades", () => {
  test("buildReadFacade exposes pointer, entries, and JSONPath reads without document facade", () => {
    let state = initial;
    const read = buildReadFacade({
      schema: Schema,
      getState: () => state,
    });

    expect(read.at("/title")).toEqual({ ok: true, path: "/title", value: "Board" });
    expect(read.exists("/items/1/done")).toBe(true);
    expect(read.entries("/items")).toEqual({
      ok: true,
      path: "/items",
      kind: "array",
      entries: [
        { key: "0", path: "/items/0", value: { id: "a", done: false } },
        { key: "1", path: "/items/1", value: { id: "b", done: true } },
      ],
    });

    state = { ...state, title: "Next" };

    expect(read.at("/title")).toEqual({ ok: true, path: "/title", value: "Next" });
    expect(read.query("$.items[?@.done == true]")).toEqual({
      ok: true,
      query: "$.items[?@.done == true]",
      pointers: ["/items/1"],
    });
  });

  test("createSchemaState exposes serializable path introspection without document facade", () => {
    const schema = createSchemaState({ schema: Schema });

    expect(schema.kind("/items")).toEqual({
      ok: true,
      path: "/items",
      mode: "value",
      kind: "array",
    });
    expect(schema.describe("/items/0")).toMatchObject({
      ok: true,
      path: "/items/0",
      mode: "value",
      description: {
        kind: "object",
        keys: ["id", "done"],
      },
    });
    expect(schema.accepts("/items/0", { id: "c", done: false })).toEqual({ ok: true });
    expect(schema.accepts("/items/0", { id: "c", done: "no" })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
  });
});
