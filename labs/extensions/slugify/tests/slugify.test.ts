import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canSlugify, createSlugify, type SlugifyResult } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  slug: z.string(),
  n: z.number(),
});

function createDoc(title = "Hello, World!") {
  return createJSONDocument(Schema, { title, slug: "", n: 1 });
}

function expectOk(result: SlugifyResult): Extract<SlugifyResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/slugify", () => {
  test("slugifies a title into the slug field", () => {
    const doc = createDoc("Hello, World!");
    const s = createSlugify(doc);

    const result = expectOk(s.slugify("/title", "/slug"));
    expect(result.slug).toBe("hello-world");
    expect(doc.value.slug).toBe("hello-world");
  });

  test("collapses runs and trims separators", () => {
    const doc = createDoc("  Foo --- Bar??  ");
    expectOk(createSlugify(doc).slugify("/title", "/slug"));
    expect(doc.value.slug).toBe("foo-bar");
  });

  test("strips diacritics", () => {
    const doc = createDoc("Café Crème");
    expectOk(createSlugify(doc).slugify("/title", "/slug"));
    expect(doc.value.slug).toBe("cafe-creme");
  });

  test("custom separator and case", () => {
    const doc = createDoc("Hello World");
    expectOk(createSlugify(doc).slugify("/title", "/slug", { separator: "_", lower: false }));
    expect(doc.value.slug).toBe("Hello_World");
  });

  test("respects maxLength, trimming at a boundary", () => {
    const doc = createDoc("one two three four");
    const result = expectOk(createSlugify(doc).slugify("/title", "/slug", { maxLength: 8 }));
    expect(result.slug).toBe("one-two");
  });

  test("an identical slug is a no-op", () => {
    const doc = createJSONDocument(Schema, { title: "Hello World", slug: "hello-world", n: 1 });
    const result = expectOk(createSlugify(doc).slugify("/title", "/slug"));
    expect(result.changed).toBe(false);
  });

  test("canSlugify does not mutate", () => {
    const doc = createDoc("Hello World");
    const result = expectOk(canSlugify(doc, "/title", "/slug"));
    expect(result.slug).toBe("hello-world");
    expect(doc.value.slug).toBe("");
  });

  test("rejects a non-string source", () => {
    const doc = createDoc();
    const result = canSlugify(doc, "/n", "/slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("source_not_string");
  });

  test("rejects a missing source", () => {
    const doc = createDoc();
    const result = canSlugify(doc, "/missing", "/slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
