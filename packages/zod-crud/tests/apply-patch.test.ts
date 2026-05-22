import { describe, expect, test } from "vitest";
import * as z from "zod";

import { applyPatch } from "../src/index.js";

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
});
