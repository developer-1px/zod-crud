import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canTransform, createChangeCase, type ChangeCaseResult } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  count: z.number(),
});

function createDoc(title = "  hello world  ") {
  return createJSONDocument(Schema, { title, count: 1 });
}

function expectOk(result: ChangeCaseResult): Extract<ChangeCaseResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-change-case", () => {
  test("upper / lower", () => {
    const doc = createDoc("Hello");
    const t = createChangeCase(doc);

    expectOk(t.transform("/title", "upper"));
    expect(doc.value.title).toBe("HELLO");
    expectOk(t.transform("/title", "lower"));
    expect(doc.value.title).toBe("hello");
  });

  test("trim", () => {
    const doc = createDoc("  spaced  ");
    const t = createChangeCase(doc);

    expectOk(t.transform("/title", "trim"));
    expect(doc.value.title).toBe("spaced");
  });

  test("capitalize only the first character", () => {
    const doc = createDoc("hello world");
    const t = createChangeCase(doc);

    const result = expectOk(t.transform("/title", "capitalize"));
    expect(result.to).toBe("Hello world");
  });

  test("title-cases each word", () => {
    const doc = createDoc("hello wORLD");
    const t = createChangeCase(doc);

    expectOk(t.transform("/title", "title"));
    expect(doc.value.title).toBe("Hello World");
  });

  test("accepts a host transform function", () => {
    const doc = createDoc("abc");
    const t = createChangeCase(doc);

    expectOk(t.transform("/title", (value) => value.split("").reverse().join("")));
    expect(doc.value.title).toBe("cba");
  });

  test("an idempotent transform is a no-op", () => {
    const doc = createDoc("HELLO");
    const t = createChangeCase(doc);

    const result = expectOk(t.transform("/title", "upper"));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("canTransform does not mutate", () => {
    const doc = createDoc("hello");
    const result = expectOk(canTransform(doc, "/title", "upper"));
    expect(result.to).toBe("HELLO");
    expect(doc.value.title).toBe("hello");
  });

  test("a transform that throws is reported", () => {
    const doc = createDoc("x");
    const result = canTransform(doc, "/title", () => {
      throw new Error("boom");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("transform_failed");
  });

  test("rejects a non-string field", () => {
    const doc = createDoc();
    const result = canTransform(doc, "/count", "upper");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_a_string");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canTransform(doc, "/missing", "upper");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
