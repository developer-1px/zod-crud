import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canPadText, createPadText, type PadTextResult } from "../src/index.js";

const Schema = z.object({
  code: z.string(),
  n: z.number(),
});

function createDoc(code = "42") {
  return createJSONDocument(Schema, { code, n: 1 });
}

function expectOk(result: PadTextResult): Extract<PadTextResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/pad-text", () => {
  test("zero-pads at the start by default", () => {
    const doc = createDoc("42");
    const p = createPadText(doc);

    const result = expectOk(p.padText("/code", 5, { fill: "0" }));
    expect(result.to).toBe("00042");
    expect(doc.value.code).toBe("00042");
  });

  test("pads at the end", () => {
    const doc = createDoc("ab");
    expectOk(createPadText(doc).padText("/code", 5, { fill: ".", side: "end" }));
    expect(doc.value.code).toBe("ab...");
  });

  test("defaults to space fill", () => {
    const doc = createDoc("x");
    expectOk(createPadText(doc).padText("/code", 3));
    expect(doc.value.code).toBe("  x");
  });

  test("a string already at/over length is a no-op", () => {
    const doc = createDoc("longvalue");
    const result = expectOk(createPadText(doc).padText("/code", 4, { fill: "0" }));
    expect(result.changed).toBe(false);
  });

  test("multi-char fill follows padStart semantics", () => {
    const doc = createDoc("x");
    expectOk(createPadText(doc).padText("/code", 5, { fill: "ab" }));
    expect(doc.value.code).toBe("ababx"); // padStart("x", 5, "ab")
  });

  test("canPadText does not mutate", () => {
    const doc = createDoc("42");
    const result = expectOk(canPadText(doc, "/code", 5, { fill: "0" }));
    expect(result.to).toBe("00042");
    expect(doc.value.code).toBe("42");
  });

  test("rejects a non-string field", () => {
    const doc = createDoc();
    const result = canPadText(doc, "/n", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_a_string");
  });

  test("rejects invalid options", () => {
    const doc = createDoc();
    expect(canPadText(doc, "/code", -1).ok).toBe(false);
    const r = canPadText(doc, "/code", 3, { fill: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_options");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canPadText(doc, "/missing", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
