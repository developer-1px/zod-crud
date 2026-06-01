import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canToggleValue, createToggleValue, type ToggleValueResult } from "../src/index.js";

const Schema = z.object({
  done: z.boolean(),
  status: z.enum(["todo", "doing", "review", "done"]),
  name: z.string(),
});

function createDoc() {
  return createJSONDocument(Schema, { done: false, status: "todo", name: "x" });
}

const STATUSES = ["todo", "doing", "review", "done"] as const;

function expectOk<T>(result: ToggleValueResult<T>): Extract<ToggleValueResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/toggle-value", () => {
  test("toggles a boolean field", () => {
    const doc = createDoc();
    const c = createToggleValue(doc);

    expectOk(c.toggleValue("/done"));
    expect(doc.value.done).toBe(true);
    expectOk(c.toggleValue("/done"));
    expect(doc.value.done).toBe(false);
  });

  test("advances through an ordered value list", () => {
    const doc = createDoc();
    const c = createToggleValue(doc);

    const result = expectOk(c.toggleValue("/status", { values: STATUSES }));
    expect(result.from).toBe("todo");
    expect(result.to).toBe("doing");
    expect(doc.value.status).toBe("doing");
  });

  test("wraps around at the end", () => {
    const doc = createJSONDocument(Schema, { done: false, status: "done", name: "x" });
    const c = createToggleValue(doc);

    expectOk(c.toggleValue("/status", { values: STATUSES }));
    expect(doc.value.status).toBe("todo");
  });

  test("goes backwards with direction prev (and wraps)", () => {
    const doc = createDoc();
    const c = createToggleValue(doc);

    expectOk(c.toggleValue("/status", { values: STATUSES, direction: "prev" }));
    expect(doc.value.status).toBe("done");
  });

  test("jumps to the first entry when the current value is not in the list", () => {
    const doc = createJSONDocument(Schema, { done: false, status: "review", name: "x" });
    const c = createToggleValue(doc);

    const result = expectOk(c.toggleValue("/status", { values: ["todo", "done"] }));
    expect(result.to).toBe("todo");
  });

  test("canToggleValue does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(canToggleValue(doc, "/done"));
    expect(result.to).toBe(true);
    expect(doc.value.done).toBe(false);
  });

  test("advances an enum field from the schema when values are omitted (#130)", () => {
    const doc = createDoc();
    const c = createToggleValue(doc);

    const result = expectOk(c.toggleValue("/status"));
    expect(result.from).toBe("todo");
    expect(result.to).toBe("doing");
    expect(doc.value.status).toBe("doing");
  });

  test("rejects a non-enum non-boolean field with no values", () => {
    const doc = createDoc();
    const result = canToggleValue(doc, "/name");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_toggleable");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canToggleValue(doc, "/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
