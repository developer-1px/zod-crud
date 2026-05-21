// P4 — schema preFlight 단위 테스트.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { preFlight } from "../src/core/schema/preFlight.js";
import { move } from "../src/verbs/move.js";

const Schema = z.object({
  count: z.number().min(0),
  items: z.array(z.string()),
});

describe("core/schema/preFlight", () => {
  test("valid patch 는 ok + draft 산출", () => {
    const r = preFlight(Schema, { count: 1, items: ["a"] }, [
      { op: "replace", path: "/count", value: 2 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.count).toBe(2);
  });

  test("schema 위반 patch 는 err + violations", () => {
    const r = preFlight(Schema, { count: 1, items: [] }, [
      { op: "replace", path: "/count", value: -5 }, // min(0) 위반
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("schema_violation");
      expect(r.violations).toContainEqual({
        path: "/count",
        message: "Too small: expected number to be >=0",
      });
    }
  });

  test("violation paths are RFC 6901 escaped pointers", () => {
    const EscapedKeySchema = z.object({
      "a/b": z.object({
        "c~d": z.number().min(0),
      }),
    });

    const r = preFlight(EscapedKeySchema, { "a/b": { "c~d": 1 } }, [
      { op: "replace", path: "/a~1b/c~0d", value: -1 },
    ]);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations).toContainEqual({
        path: "/a~1b/c~0d",
        message: expect.any(String),
      });
    }
  });

  test("invalid path 는 err", () => {
    const r = preFlight(Schema, { count: 1, items: [] }, [
      { op: "replace", path: "/nonexistent", value: 0 },
    ]);
    expect(r.ok).toBe(false);
  });

  test("cross-field refinement 위반도 commit 전에 거부", () => {
    const RangeSchema = z.object({
      start: z.number(),
      end: z.number(),
    }).superRefine((value, ctx) => {
      if (value.end <= value.start) {
        ctx.addIssue({
          code: "custom",
          path: ["end"],
          message: "end must be greater than start",
        });
      }
    });

    const state = { start: 1, end: 3 };
    const r = preFlight(RangeSchema, state, [
      { op: "replace", path: "/start", value: 5 },
    ]);

    expect(r.ok).toBe(false);
    expect(state).toEqual({ start: 1, end: 3 });
    if (!r.ok) {
      expect(r.code).toBe("schema_violation");
      expect(r.violations).toContainEqual({
        path: "/end",
        message: "end must be greater than start",
      });
    }
  });
});

describe("verbs/move + preFlight gate (P4.4)", () => {
  test("정상 move 는 patch 적용", () => {
    const r = move(Schema, { count: 1, items: ["a", "b", "c"] }, "/items/0", "/items/2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next.items).toEqual(["b", "c", "a"]);
  });

  test("preFlight 실패 시 violations 노출", () => {
    const NumSchema = z.object({ items: z.array(z.string()) });
    const r = move(NumSchema, { items: ["a", "b", "c"] }, "/items/99", "/items/0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBeTruthy();
  });
});
