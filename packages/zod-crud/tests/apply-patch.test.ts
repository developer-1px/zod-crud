import { describe, expect, test } from "vitest";
import * as z from "zod";

import { applyPatch, applyPatchToTrustedState } from "../src/index.js";

describe("applyPatch public contract", () => {
  test("validates the whole resulting state", () => {
    const Schema = z.object({
      a: z.string(),
      b: z.string(),
    });

    const result = applyPatch(Schema, { a: "ok", b: 1 } as never, [
      { op: "replace", path: "/a", value: "next" },
    ]);

    expect(result.result).toMatchObject({ ok: false, code: "schema_violation" });
    expect(result.state).toEqual({ a: "ok", b: 1 });
  });

  test("repeated same-array element replace batches still validate the whole result once", () => {
    const Item = z.object({ id: z.string(), done: z.boolean() });
    const Schema = z.object({ items: z.array(Item), title: z.string() });
    const state = Schema.parse({
      items: [
        { id: "a", done: false },
        { id: "b", done: false },
      ],
      title: "draft",
    });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    const result = applyPatch(Schema, state, [
      { op: "replace", path: "/items/0", value: { id: "a1", done: true } },
      { op: "replace", path: "/items/0", value: { id: "a2", done: false } },
      { op: "replace", path: "/items/1", value: { id: "b1", done: true } },
    ]);

    expect(result.result).toEqual({ ok: true });
    expect(result.state).toEqual({
      items: [
        { id: "a2", done: false },
        { id: "b1", done: true },
      ],
      title: "draft",
    });
    expect(result.state).not.toBe(state);
    expect(result.state.items).not.toBe(state.items);
    expect(rootParses).toBe(1);
  });

  test("trusted-state repeated same-array element replace batches use local validation", () => {
    const Item = z.object({ id: z.string(), done: z.boolean() });
    const Schema = z.object({ items: z.array(Item), title: z.string() });
    const state = Schema.parse({
      items: [
        { id: "a", done: false },
        { id: "b", done: false },
      ],
      title: "draft",
    });
    const originalSafeParse = Schema.safeParse.bind(Schema);
    let rootParses = 0;
    Schema.safeParse = ((value: unknown) => {
      rootParses += 1;
      return originalSafeParse(value);
    }) as typeof Schema.safeParse;

    const result = applyPatchToTrustedState(Schema, state, [
      { op: "replace", path: "/items/0", value: { id: "a1", done: true } },
      { op: "replace", path: "/items/0", value: { id: "a2", done: false } },
      { op: "replace", path: "/items/1", value: { id: "b1", done: true } },
    ]);

    expect(result.result).toEqual({ ok: true });
    expect(result.state.items.map((item) => item.id)).toEqual(["a2", "b1"]);
    expect(rootParses).toBe(0);
  });

  test("root object replace batches reject non JSON values", () => {
    const Schema = z.object({
      a: z.unknown(),
      b: z.unknown(),
    });
    const state = { a: "ok", b: "ok" };

    const result = applyPatch(Schema, state, [
      { op: "replace", path: "/a", value: "next" },
      { op: "replace", path: "/b", value: () => "bad" },
    ]);

    expect(result.result).toMatchObject({ ok: false, code: "not_serializable" });
    expect(result.state).toBe(state);
  });
});
