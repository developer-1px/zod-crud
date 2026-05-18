// SPEC.md §5.5 — serialize/parse/safeParse round-trip + G1 보장.

import { describe, expect, it } from "vitest";
import * as z from "zod";

import { serialize, parse, safeParse, applyPatch } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

describe("serialize / parse", () => {
  it("round-trips state through JSON", () => {
    const state = { title: "doc", tasks: [{ id: "a", done: false }] };
    const s = serialize(state);
    expect(typeof s).toBe("string");
    expect(parse(Schema, s)).toEqual(state);
  });

  it("safeParse returns error on schema violation", () => {
    const r = safeParse(Schema, JSON.stringify({ title: 123, tasks: [] }));
    expect(r.ok).toBe(false);
  });

  it("safeParse returns ok on valid JSON", () => {
    const r = safeParse(Schema, JSON.stringify({ title: "x", tasks: [] }));
    expect(r.ok).toBe(true);
  });

  it("rejects non-JSON values instead of silently dropping data", () => {
    expect(() => serialize({ ok: true, lost: undefined })).toThrow(TypeError);
    expect(() => serialize(new Date("2026-05-18T00:00:00.000Z"))).toThrow(TypeError);
    expect(() => serialize(Number.NaN)).toThrow(TypeError);
  });
});

describe("G1 — JSON-only state after operations", () => {
  it("state remains plain JSON after a batch of operations", () => {
    const initial = { title: "", tasks: [] as { id: string; done: boolean }[] };
    const r = applyPatch(Schema, initial, [
      { op: "add", path: "/tasks/-", value: { id: "a", done: false } },
      { op: "replace", path: "/title", value: "x" },
      { op: "replace", path: "/tasks/0/done", value: true },
    ]);
    expect(r.result.ok).toBe(true);
    const s = serialize(r.state);
    expect(JSON.parse(s)).toEqual(r.state);
  });
});
