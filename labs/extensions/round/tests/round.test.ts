import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { canRound, createRound, type RoundResult } from "../src/index.js";

const Schema = z.object({
  price: z.number(),
  label: z.string(),
});

function createDoc(price = 3.14159) {
  return createJSONDocument(Schema, { price, label: "x" });
}

function expectOk(result: RoundResult): Extract<RoundResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-round", () => {
  test("rounds to a precision", () => {
    const doc = createDoc(3.14159);
    const r = createRound(doc);

    const result = expectOk(r.round("/price", { precision: 2 }));
    expect(result.to).toBe(3.14);
    expect(doc.value.price).toBe(3.14);
  });

  test("rounds to integer by default", () => {
    const doc = createDoc(2.6);
    expectOk(createRound(doc).round("/price"));
    expect(doc.value.price).toBe(3);
  });

  test("floor / ceil / trunc modes", () => {
    expect(expectOk(canRound(createDoc(2.9), "/price", { mode: "floor" })).to).toBe(2);
    expect(expectOk(canRound(createDoc(2.1), "/price", { mode: "ceil" })).to).toBe(3);
    expect(expectOk(canRound(createDoc(-2.7), "/price", { mode: "trunc" })).to).toBe(-2);
  });

  test("rounds to a step (nearest multiple)", () => {
    const doc = createDoc(0.62);
    expectOk(createRound(doc).round("/price", { step: 0.25 }));
    expect(doc.value.price).toBe(0.5);
  });

  test("step with ceil snaps up", () => {
    const doc = createDoc(0.62);
    expectOk(createRound(doc).round("/price", { step: 0.25, mode: "ceil" }));
    expect(doc.value.price).toBe(0.75);
  });

  test("an already-rounded value is a no-op", () => {
    const doc = createDoc(3);
    const result = expectOk(createRound(doc).round("/price", { precision: 2 }));
    expect(result.changed).toBe(false);
  });

  test("canRound does not mutate", () => {
    const doc = createDoc(3.14159);
    const result = expectOk(canRound(doc, "/price", { precision: 1 }));
    expect(result.to).toBe(3.1);
    expect(doc.value.price).toBe(3.14159);
  });

  test("rejects a non-number field", () => {
    const doc = createDoc();
    const result = canRound(doc, "/label");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_a_number");
  });

  test("rejects invalid options", () => {
    const doc = createDoc();
    expect(canRound(doc, "/price", { step: -1 }).ok).toBe(false);
    const r = canRound(doc, "/price", { precision: 1.5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_options");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canRound(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
