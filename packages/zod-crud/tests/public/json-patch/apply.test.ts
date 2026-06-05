import { describe, expect, test } from "vitest";
import * as z from "zod";

import { applyPatch, applyPatchToTrustedState } from "zod-crud";

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

  test("ordered full root object replace keeps __proto__ as data", () => {
    const state: Record<string, unknown> = { a: 1 };
    Object.defineProperty(state, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const result = applyPatchToTrustedState(z.any(), state, [
      { op: "replace", path: "/a", value: 2 },
      { op: "replace", path: "/__proto__", value: { safe: false } },
    ]);

    expect(result.result).toEqual({ ok: true });
    expect(Object.keys(result.state as Record<string, unknown>)).toEqual(["a", "__proto__"]);
    expect((result.state as Record<string, unknown>).a).toBe(2);
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(result.state as object, "__proto__")).toBe(true);
    expect((result.state as Record<string, unknown>).__proto__).toEqual({ safe: false });
  });
});
