import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canTruncate, createTruncate, type TruncateResult } from "../src/index.js";

const Schema = z.object({
  summary: z.string(),
  n: z.number(),
});

function createDoc(summary = "the quick brown fox") {
  return createJSONDocument(Schema, { summary, n: 1 });
}

function expectOk(result: TruncateResult): Extract<TruncateResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/truncate", () => {
  test("truncates to max length", () => {
    const doc = createDoc("the quick brown fox");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 9));
    expect(result.to).toBe("the quick");
    expect(doc.value.summary).toBe("the quick");
  });

  test("appends an ellipsis within the budget", () => {
    const doc = createDoc("the quick brown fox");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 10, { ellipsis: "…" }));
    expect(result.to).toBe("the quick…");
    expect(result.to.length).toBe(10);
  });

  test("word boundary trims at the last space", () => {
    const doc = createDoc("the quick brown fox");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 13, { wordBoundary: true }));
    expect(result.to).toBe("the quick");
  });

  test("word boundary with ellipsis", () => {
    const doc = createDoc("the quick brown fox");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 14, { wordBoundary: true, ellipsis: "..." }));
    expect(result.to).toBe("the quick...");
    expect(result.to.length).toBeLessThanOrEqual(14);
  });

  test("a string within the limit is a no-op", () => {
    const doc = createDoc("short");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 10));
    expect(result.changed).toBe(false);
  });

  test("never exceeds maxLength even with a long ellipsis", () => {
    const doc = createDoc("abcdef");
    const t = createTruncate(doc);

    const result = expectOk(t.truncate("/summary", 3, { ellipsis: "....." }));
    expect(result.to.length).toBeLessThanOrEqual(3);
  });

  test("canTruncate does not mutate", () => {
    const doc = createDoc("the quick brown fox");
    const result = expectOk(canTruncate(doc, "/summary", 5));
    expect(result.to).toBe("the q");
    expect(doc.value.summary).toBe("the quick brown fox");
  });

  test("rejects a non-string field", () => {
    const doc = createDoc();
    const result = canTruncate(doc, "/n", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_a_string");
  });

  test("rejects a negative or non-integer maxLength", () => {
    const doc = createDoc();
    expect(canTruncate(doc, "/summary", -1).ok).toBe(false);
    const r = canTruncate(doc, "/summary", 2.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_max");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canTruncate(doc, "/missing", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
