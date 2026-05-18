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

  it("safeParse returns a ZodError on invalid JSON even when schema accepts undefined", () => {
    const r = safeParse(z.any(), "{");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(z.ZodError);
      expect(r.error.issues[0]?.code).toBe("custom");
    }
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

  it("rejects object properties that JSON.stringify would invoke or drop", () => {
    const hidden = { ok: true };
    Object.defineProperty(hidden, "lost", { value: 1, enumerable: false });

    const accessor = {
      ok: true,
      get computed() {
        return 1;
      },
    };

    expect(() => serialize(hidden)).toThrow(/non-enumerable property/);
    expect(() => serialize(accessor)).toThrow(/accessor property/);
  });

  it("reports JSON boundary errors with escaped RFC 6901 pointers", () => {
    expect(() => serialize({ "a/b": { "c~d": undefined } })).toThrow("/a~1b/c~0d: undefined is not JSON");

    const hidden = { "a/b": {} };
    Object.defineProperty(hidden["a/b"], "c~d", { value: 1, enumerable: false });

    expect(() => serialize(hidden)).toThrow("/a~1b/c~0d: non-enumerable property is not JSON");
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
