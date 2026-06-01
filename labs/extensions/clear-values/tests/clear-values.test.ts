import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canClearValues, createClearValues, type ClearValuesResult } from "../src/index.js";

const Schema = z.object({
  name: z.string().min(1),
  title: z.string(),
  qty: z.number().default(5),
  count: z.number(),
  done: z.boolean(),
  nick: z.string().nullable(),
  tags: z.array(z.string()),
  bag: z.record(z.string(), z.string()),
  status: z.enum(["a", "b"]),
});

function createDoc() {
  return createJSONDocument(Schema, {
    name: "n",
    title: "t",
    qty: 9,
    count: 7,
    done: true,
    nick: "x",
    tags: ["a"],
    bag: { k: "v" },
    status: "a",
  });
}

function expectOk(result: ClearValuesResult): Extract<ClearValuesResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/clear-values", () => {
  test("clears scalar fields to their type-empty value", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/title", "/count", "/done"]));
    expect(doc.value.title).toBe("");
    expect(doc.value.count).toBe(0);
    expect(doc.value.done).toBe(false);
  });

  test("prefers the schema default over a type-empty value", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/qty"]));
    expect(doc.value.qty).toBe(5);
  });

  test("clears arrays to [] and records to {}", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/tags", "/bag"]));
    expect(doc.value.tags).toEqual([]);
    expect(doc.value.bag).toEqual({});
  });

  test("clears a nullable field to null", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/nick"]));
    expect(doc.value.nick).toBeNull();
  });

  test("an enum cannot be cleared from schema alone", () => {
    const doc = createDoc();
    const result = canClearValues(doc, ["/status"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("cannot_derive_empty");
  });

  test("a host emptyFor supplies values for non-derivable kinds", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/status"], { emptyFor: () => "b" }));
    expect(doc.value.status).toBe("b");
  });

  test("emptyFor is authoritative even for derivable kinds", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    expectOk(clearer.clearValues(["/title"], { emptyFor: () => "host-default" }));
    expect(doc.value.title).toBe("host-default");
  });

  test("a clear that violates the schema is rejected by canPatch", () => {
    const doc = createDoc();
    const clearer = createClearValues(doc);

    // name has min(1); clearing to "" must be rejected, nothing applied.
    const result = clearer.clearValues(["/name"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.name).toBe("n");
  });

  test("clearing an already-empty field is a no-op", () => {
    const doc = createDoc();
    doc.replace("/title", "");
    const clearer = createClearValues(doc);

    const result = expectOk(clearer.clearValues(["/title"]));
    expect(result.changed).toBe(false);
    expect(result.operations).toEqual([]);
  });

  test("canClearValues does not mutate the document", () => {
    const doc = createDoc();
    const result = expectOk(canClearValues(doc, ["/title", "/count"]));
    expect(result.changed).toBe(true);
    expect(doc.value.title).toBe("t");
    expect(doc.value.count).toBe(7);
  });

  test("an empty target is rejected", () => {
    const doc = createDoc();
    const result = canClearValues(doc, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_target");
  });
});
