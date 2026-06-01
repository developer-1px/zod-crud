import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canStep, createIncrementNumber, type IncrementNumberResult } from "../src/index.js";

const Schema = z.object({
  qty: z.number().int().min(0).max(10),
  label: z.string(),
});

function createDoc() {
  return createJSONDocument(Schema, { qty: 5, label: "x" });
}

function expectOk(result: IncrementNumberResult): Extract<IncrementNumberResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/increment-number", () => {
  test("increments by 1 by default", () => {
    const doc = createDoc();
    const n = createIncrementNumber(doc);

    const result = expectOk(n.increment("/qty"));
    expect(result.from).toBe(5);
    expect(result.to).toBe(6);
    expect(doc.value.qty).toBe(6);
  });

  test("decrements by 1 by default", () => {
    const doc = createDoc();
    const n = createIncrementNumber(doc);

    expectOk(n.decrement("/qty"));
    expect(doc.value.qty).toBe(4);
  });

  test("steps by a custom amount", () => {
    const doc = createDoc();
    const n = createIncrementNumber(doc);

    expectOk(n.step("/qty", { step: 3 }));
    expect(doc.value.qty).toBe(8);
  });

  test("decrement honors a custom step magnitude", () => {
    const doc = createDoc();
    const n = createIncrementNumber(doc);

    expectOk(n.decrement("/qty", { step: 2 }));
    expect(doc.value.qty).toBe(3);
  });

  test("clamps to min/max", () => {
    const doc = createDoc();
    const n = createIncrementNumber(doc);

    const result = expectOk(n.step("/qty", { step: 100, max: 9 }));
    expect(result.to).toBe(9);
    expect(doc.value.qty).toBe(9);
  });

  test("a clamp that yields no change is a no-op", () => {
    const doc = createJSONDocument(Schema, { qty: 10, label: "x" });
    const n = createIncrementNumber(doc);

    const result = expectOk(n.step("/qty", { step: 5, max: 10 }));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("a step that violates the schema is rejected by canPatch", () => {
    const doc = createJSONDocument(Schema, { qty: 10, label: "x" });
    const n = createIncrementNumber(doc);

    // schema max is 10; stepping to 11 (no clamp) must be rejected.
    const result = n.step("/qty", { step: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.qty).toBe(10);
  });

  test("canStep does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canStep(doc, "/qty"));
    expect(result.to).toBe(6);
    expect(doc.value.qty).toBe(5);
  });

  test("rejects a non-number field", () => {
    const doc = createDoc();
    const result = canStep(doc, "/label");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_a_number");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canStep(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
