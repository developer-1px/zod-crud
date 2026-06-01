import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canConvertType, createConvertType, type ConvertTypeResult } from "../src/index.js";

// convert-type is meaningful on permissive (union) fields, where changing the runtime
// type stays schema-valid. On a strict single-type field the result type would
// not match the schema and canPatch rejects it (see the patch_rejected test).
const Schema = z.object({
  val: z.union([z.string(), z.number(), z.boolean()]),
  strictNum: z.number(),
});

function createDoc(val: string | number | boolean = "5") {
  return createJSONDocument(Schema, { val, strictNum: 1 });
}

function expectOk(result: ConvertTypeResult): Extract<ConvertTypeResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/convert-type", () => {
  test("string to number", () => {
    const doc = createDoc("5");
    const c = createConvertType(doc);

    const result = expectOk(c.convertType("/val", "number"));
    expect(result.to).toBe(5);
    expect(doc.value.val).toBe(5);
  });

  test("string to integer truncates", () => {
    const doc = createDoc("5.9");
    const c = createConvertType(doc);

    expectOk(c.convertType("/val", "integer"));
    expect(doc.value.val).toBe(5);
  });

  test("number to string", () => {
    const doc = createDoc(42);
    const c = createConvertType(doc);

    expectOk(c.convertType("/val", "string"));
    expect(doc.value.val).toBe("42");
  });

  test("common string spellings to boolean", () => {
    const c = createConvertType(createDoc("yes"));
    expect(expectOk(canConvertType(createDoc("yes"), "/val", "boolean")).to).toBe(true);
    expect(expectOk(canConvertType(createDoc("off"), "/val", "boolean")).to).toBe(false);
    void c;
  });

  test("number to boolean (0 is false, nonzero true)", () => {
    expect(expectOk(canConvertType(createDoc(0), "/val", "boolean")).to).toBe(false);
    expect(expectOk(canConvertType(createDoc(3), "/val", "boolean")).to).toBe(true);
  });

  test("non-numeric string to number is not convertible", () => {
    const doc = createDoc("abc");
    const result = canConvertType(doc, "/val", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_convertible");
  });

  test("an ambiguous string to boolean is not convertible", () => {
    const doc = createDoc("maybe");
    const result = canConvertType(doc, "/val", "boolean");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_convertible");
  });

  test("a conversion that violates a strict schema is rejected by canPatch", () => {
    const doc = createDoc();
    const result = canConvertType(doc, "/strictNum", "string"); // 1 -> "1", but field is number
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
  });

  test("converting to the same value is a no-op", () => {
    const doc = createDoc(5);
    const c = createConvertType(doc);
    const result = expectOk(c.convertType("/val", "number"));
    expect(result.changed).toBe(false);
  });

  test("canConvertType does not mutate", () => {
    const doc = createDoc("5");
    const result = expectOk(canConvertType(doc, "/val", "number"));
    expect(result.to).toBe(5);
    expect(doc.value.val).toBe("5");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canConvertType(doc, "/missing", "number");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
