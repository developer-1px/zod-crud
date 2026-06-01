import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canCycle, createCycle, type CycleResult } from "../src/index.js";

const Schema = z.object({
  done: z.boolean(),
  status: z.enum(["todo", "doing", "review", "done"]),
  name: z.string(),
});

function createDoc() {
  return createJSONDocument(Schema, { done: false, status: "todo", name: "x" });
}

const STATUSES = ["todo", "doing", "review", "done"] as const;

function expectOk<T>(result: CycleResult<T>): Extract<CycleResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/cycle", () => {
  test("toggles a boolean field", () => {
    const doc = createDoc();
    const c = createCycle(doc);

    expectOk(c.cycle("/done"));
    expect(doc.value.done).toBe(true);
    expectOk(c.cycle("/done"));
    expect(doc.value.done).toBe(false);
  });

  test("advances through an ordered value list", () => {
    const doc = createDoc();
    const c = createCycle(doc);

    const result = expectOk(c.cycle("/status", { values: STATUSES }));
    expect(result.from).toBe("todo");
    expect(result.to).toBe("doing");
    expect(doc.value.status).toBe("doing");
  });

  test("wraps around at the end", () => {
    const doc = createJSONDocument(Schema, { done: false, status: "done", name: "x" });
    const c = createCycle(doc);

    expectOk(c.cycle("/status", { values: STATUSES }));
    expect(doc.value.status).toBe("todo");
  });

  test("goes backwards with direction prev (and wraps)", () => {
    const doc = createDoc();
    const c = createCycle(doc);

    expectOk(c.cycle("/status", { values: STATUSES, direction: "prev" }));
    expect(doc.value.status).toBe("done");
  });

  test("jumps to the first entry when the current value is not in the list", () => {
    const doc = createJSONDocument(Schema, { done: false, status: "review", name: "x" });
    const c = createCycle(doc);

    const result = expectOk(c.cycle("/status", { values: ["todo", "done"] }));
    expect(result.to).toBe("todo");
  });

  test("canCycle does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canCycle(doc, "/done"));
    expect(result.to).toBe(true);
    expect(doc.value.done).toBe(false);
  });

  test("cycles an enum field from the schema when values are omitted (#130)", () => {
    const doc = createDoc();
    const c = createCycle(doc);

    const result = expectOk(c.cycle("/status"));
    expect(result.from).toBe("todo");
    expect(result.to).toBe("doing");
    expect(doc.value.status).toBe("doing");
  });

  test("rejects a non-enum non-boolean field with no values", () => {
    const doc = createDoc();
    const result = canCycle(doc, "/name");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_cyclable");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canCycle(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
