import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canGenerateSlug, createGenerateSlug, type GenerateSlugResult } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  slug: z.string(),
  n: z.number(),
});

function createDoc(title = "Hello, World!") {
  return createJSONDocument(Schema, { title, slug: "", n: 1 });
}

function expectOk(result: GenerateSlugResult): Extract<GenerateSlugResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-generate-slug", () => {
  test("slugifies a title into the slug field", () => {
    const doc = createDoc("Hello, World!");
    const s = createGenerateSlug(doc);

    const result = expectOk(s.generateSlug("/title", "/slug"));
    expect(result.slug).toBe("hello-world");
    expect(doc.value.slug).toBe("hello-world");
  });

  test("collapses runs and trims separators", () => {
    const doc = createDoc("  Foo --- Bar??  ");
    expectOk(createGenerateSlug(doc).generateSlug("/title", "/slug"));
    expect(doc.value.slug).toBe("foo-bar");
  });

  test("strips diacritics", () => {
    const doc = createDoc("Café Crème");
    expectOk(createGenerateSlug(doc).generateSlug("/title", "/slug"));
    expect(doc.value.slug).toBe("cafe-creme");
  });

  test("custom separator and case", () => {
    const doc = createDoc("Hello World");
    expectOk(createGenerateSlug(doc).generateSlug("/title", "/slug", { separator: "_", lower: false }));
    expect(doc.value.slug).toBe("Hello_World");
  });

  test("respects maxLength, trimming at a boundary", () => {
    const doc = createDoc("one two three four");
    const result = expectOk(createGenerateSlug(doc).generateSlug("/title", "/slug", { maxLength: 8 }));
    expect(result.slug).toBe("one-two");
  });

  test("an identical slug is a no-op", () => {
    const doc = createJSONDocument(Schema, { title: "Hello World", slug: "hello-world", n: 1 });
    const result = expectOk(createGenerateSlug(doc).generateSlug("/title", "/slug"));
    expect(result.changed).toBe(false);
  });

  test("canGenerateSlug does not mutate", () => {
    const doc = createDoc("Hello World");
    const result = expectOk(canGenerateSlug(doc, "/title", "/slug"));
    expect(result.slug).toBe("hello-world");
    expect(doc.value.slug).toBe("");
  });

  test("rejects a non-string source", () => {
    const doc = createDoc();
    const result = canGenerateSlug(doc, "/n", "/slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("source_not_string");
  });

  test("rejects a missing source", () => {
    const doc = createDoc();
    const result = canGenerateSlug(doc, "/missing", "/slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
