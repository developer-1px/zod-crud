// JSON Schema (draft-2020-12) 양방향 — 외부 표준 도구와의 다리 검증.

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJSONSchema, fromJSONSchema } from "../src/schema-bridge.js";
import { applyPatch } from "../src/core/patch.js";

describe("zod → JSON Schema (draft-2020-12)", () => {
  test("기본 object 타입 export", () => {
    const S = z.object({ name: z.string(), age: z.number() });
    const js = toJSONSchema(S);
    expect(js).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
    });
  });

  test("draft-2020-12 dialect 표시", () => {
    const S = z.object({ x: z.string() });
    const js = toJSONSchema(S) as { $schema?: string };
    expect(js.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  test("refinement 보존 — min/max/regex/enum", () => {
    const S = z.object({
      name: z.string().min(1).max(80),
      role: z.enum(["admin", "user"]),
      pattern: z.string().regex(/^[a-z]+$/),
    });
    const js = toJSONSchema(S) as { properties: Record<string, unknown> };
    expect(js.properties.name).toMatchObject({ type: "string", minLength: 1, maxLength: 80 });
    expect(js.properties.role).toMatchObject({ enum: ["admin", "user"] });
    expect((js.properties.pattern as { pattern?: string }).pattern).toBe("^[a-z]+$");
  });

  test("재귀 schema (lazy) 도 변환", () => {
    type Node = { text: string; children: Node[] };
    const NodeSchema: z.ZodType<Node> = z.object({
      text: z.string(),
      get children() { return z.array(NodeSchema); },
    });
    const js = toJSONSchema(NodeSchema);
    // $ref 또는 재귀 표현이 있어야 함 (구체 형식은 zod 구현에 위임)
    expect(JSON.stringify(js)).toContain("text");
  });

  test("nested object · array 지원", () => {
    const S = z.object({
      tags: z.array(z.string()),
      meta: z.object({ created: z.string() }),
    });
    const js = toJSONSchema(S) as { properties: Record<string, unknown> };
    expect(js.properties.tags).toMatchObject({ type: "array", items: { type: "string" } });
    expect(js.properties.meta).toMatchObject({ type: "object" });
  });
});

describe("JSON Schema → zod", () => {
  test("기본 object 변환 후 parse 동작", () => {
    const js = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { name: { type: "string" }, age: { type: "number" } },
      required: ["name", "age"],
    } as const;
    const S = fromJSONSchema(js);
    expect(S.safeParse({ name: "alice", age: 30 }).success).toBe(true);
    expect(S.safeParse({ name: "alice" }).success).toBe(false); // age missing
    expect(S.safeParse({ name: 1, age: 30 }).success).toBe(false); // wrong type
  });

  test("min/max constraint 보존", () => {
    const js = {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
      required: ["name"],
    } as const;
    const S = fromJSONSchema(js);
    expect(S.safeParse({ name: "x" }).success).toBe(true);
    expect(S.safeParse({ name: "" }).success).toBe(false);
    expect(S.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("round-trip — zod → JSON Schema → zod", () => {
  test("기본 형식 round-trip 후 동등 검증", () => {
    const original = z.object({ name: z.string(), age: z.number().int().min(0) });
    const js = toJSONSchema(original);
    const restored = fromJSONSchema(js as never);

    const valid = { name: "alice", age: 30 };
    const invalid = { name: "alice", age: -1 };
    expect(original.safeParse(valid).success).toBe(true);
    expect(restored.safeParse(valid).success).toBe(true);
    expect(original.safeParse(invalid).success).toBe(false);
    expect(restored.safeParse(invalid).success).toBe(false);
  });

  test("우리 substrate 가 round-trip 된 schema 로도 mutation 검증", () => {
    const original = z.object({ items: z.array(z.string().min(1)) });
    const js = toJSONSchema(original);
    const restored = fromJSONSchema(js as never);

    // 잘못된 mutation 거부
    const r = applyPatch(restored, { items: [] }, [{ op: "add", path: "/items/0", value: "" }]);
    expect(r.result.ok).toBe(false);
    expect(r.result.ok ? null : r.result.code).toBe("schema_violation");
  });
});
