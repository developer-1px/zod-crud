import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canJoin, createJoinText, type JoinTextResult } from "../src/index.js";

const Schema = z.object({
  tags: z.array(z.string()),
  nums: z.array(z.number()),
  display: z.string(),
});

function createDoc() {
  return createJSONDocument(Schema, { tags: ["a", "b", "c"], nums: [1, 2, 3], display: "" });
}

function expectOk(result: JoinTextResult): Extract<JoinTextResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-join-text", () => {
  test("joins string items with the default separator", () => {
    const doc = createDoc();
    const j = createJoinText(doc);

    const result = expectOk(j.join("/tags", "/display"));
    expect(result.value).toBe("a, b, c");
    expect(doc.value.display).toBe("a, b, c");
  });

  test("uses a custom separator", () => {
    const doc = createDoc();
    const j = createJoinText(doc);

    expectOk(j.join("/tags", "/display", { separator: " | " }));
    expect(doc.value.display).toBe("a | b | c");
  });

  test("maps non-string items via a host function", () => {
    const doc = createDoc();
    const j = createJoinText(doc);

    expectOk(j.join("/nums", "/display", { map: (n) => `#${n as number}` }));
    expect(doc.value.display).toBe("#1, #2, #3");
  });

  test("default map stringifies non-string items", () => {
    const doc = createDoc();
    const j = createJoinText(doc);

    const result = expectOk(j.join("/nums", "/display"));
    expect(result.value).toBe("1, 2, 3");
  });

  test("dropEmpty removes blank parts", () => {
    const doc = createJSONDocument(Schema, { tags: ["a", "", "c"], nums: [], display: "" });
    const j = createJoinText(doc);

    const result = expectOk(j.join("/tags", "/display", { dropEmpty: true }));
    expect(result.value).toBe("a, c");
  });

  test("an identical result is a no-op", () => {
    const doc = createJSONDocument(Schema, { tags: ["a", "b"], nums: [], display: "a, b" });
    const j = createJoinText(doc);

    const result = expectOk(j.join("/tags", "/display"));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("canJoin does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canJoin(doc, "/tags", "/display"));
    expect(result.value).toBe("a, b, c");
    expect(doc.value.display).toBe("");
  });

  test("rejects a non-array source", () => {
    const doc = createDoc();
    const result = canJoin(doc, "/display", "/display");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("source_not_array");
  });

  test("rejects a missing source", () => {
    const doc = createDoc();
    const result = canJoin(doc, "/missing", "/display");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });

  test("a map that throws is reported", () => {
    const doc = createDoc();
    const result = canJoin(doc, "/tags", "/display", {
      map: () => {
        throw new Error("boom");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("map_failed");
  });
});
