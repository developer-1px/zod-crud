import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canCoerce, createCoerce, type CoerceResult } from "../src/index.js";

// coerce is meaningful on permissive (union) fields, where changing the runtime
// type stays schema-valid. On a strict single-type field the result type would
// not match the schema and canPatch rejects it (see the patch_rejected test).
const Schema = z.object({
  val: z.union([z.string(), z.number(), z.boolean()]),
  strictNum: z.number(),
});

function createDoc(val: string | number | boolean = "5") {
  return createJSONDocument(Schema, { val, strictNum: 1 });
}

function expectOk(result: CoerceResult): Extract<CoerceResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/coerce", () => {
  test("string to number", () => {
    const doc = createDoc("5");
    const c = createCoerce(doc);

    const result = expectOk(c.coerce("/val", "number"));
    expect(result.to).toBe(5);
    expect(doc.value.val).toBe(5);
  });

  test("string to integer truncates", () => {
    const doc = createDoc("5.9");
    const c = createCoerce(doc);

    expectOk(c.coerce("/val", "integer"));
    expect(doc.value.val).toBe(5);
  });

  test("number to string", () => {
    const doc = createDoc(42);
    const c = createCoerce(doc);

    expectOk(c.coerce("/val", "string"));
    expect(doc.value.val).toBe("42");
  });

  test("common string spellings to boolean", () => {
    const c = createCoerce(createDoc("yes"));
    expect(expectOk(canCoerce(createDoc("yes"), "/val", "boolean")).to).toBe(true);
    expect(expectOk(canCoerce(createDoc("off"), "/val", "boolean")).to).toBe(false);
    void c;
  });

  test("number to boolean (0 is false, nonzero true)", () => {
    expect(expectOk(canCoerce(createDoc(0), "/val", "boolean")).to).toBe(false);
    expect(expectOk(canCoerce(createDoc(3), "/val", "boolean")).to).toBe(true);
  });

  test("non-numeric string to number is not coercible", () => {
    const doc = createDoc("abc");
    const result = canCoerce(doc, "/val", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_coercible");
  });

  test("an ambiguous string to boolean is not coercible", () => {
    const doc = createDoc("maybe");
    const result = canCoerce(doc, "/val", "boolean");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_coercible");
  });

  test("a coercion that violates a strict schema is rejected by canPatch", () => {
    const doc = createDoc();
    const result = canCoerce(doc, "/strictNum", "string"); // 1 -> "1", but field is number
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
  });

  test("coercing to the same value is a no-op", () => {
    const doc = createDoc(5);
    const c = createCoerce(doc);
    const result = expectOk(c.coerce("/val", "number"));
    expect(result.changed).toBe(false);
  });

  test("canCoerce does not mutate", () => {
    const doc = createDoc("5");
    const result = expectOk(canCoerce(doc, "/val", "number"));
    expect(result.to).toBe(5);
    expect(doc.value.val).toBe("5");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canCoerce(doc, "/missing", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
