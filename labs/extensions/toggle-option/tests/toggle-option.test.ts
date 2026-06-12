import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import { createToggleOption, plan, type ToggleOptionResult } from "../src/index.js";

const Schema = z.object({
  tags: z.array(z.string()),
  refs: z.array(z.object({ id: z.string() })),
});

function createDoc(tags = ["a", "b"]) {
  return createJSONDocument(Schema, { tags, refs: [{ id: "x" }] });
}

function expectOk(result: ToggleOptionResult): Extract<ToggleOptionResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@interactive-os/json-document-toggle-option", () => {
  test("toggle adds an absent value", () => {
    const doc = createDoc();
    const m = createToggleOption(doc);

    const result = expectOk(m.toggle("/tags", "c"));
    expect(result.action).toBe("added");
    expect(result.present).toBe(true);
    expect(doc.value.tags).toEqual(["a", "b", "c"]);
  });

  test("toggle removes a present value (all occurrences)", () => {
    const doc = createDoc(["a", "b", "a"]);
    const m = createToggleOption(doc);

    const result = expectOk(m.toggle("/tags", "a"));
    expect(result.action).toBe("removed");
    expect(result.present).toBe(false);
    expect(doc.value.tags).toEqual(["b"]);
  });

  test("add is idempotent", () => {
    const doc = createDoc();
    const m = createToggleOption(doc);

    const result = expectOk(m.add("/tags", "a"));
    expect(result.action).toBe("none");
    expect(result.changed).toBe(false);
    expect(doc.value.tags).toEqual(["a", "b"]);
  });

  test("remove of an absent value is a no-op", () => {
    const doc = createDoc();
    const m = createToggleOption(doc);

    const result = expectOk(m.remove("/tags", "z"));
    expect(result.action).toBe("none");
    expect(result.present).toBe(false);
  });

  test("object membership via keyOf", () => {
    const doc = createDoc();
    const m = createToggleOption(doc);

    const result = expectOk(
      m.toggle<{ id: string }>("/refs", { id: "x" }, { keyOf: (r) => r.id }),
    );
    expect(result.action).toBe("removed");
    expect(doc.value.refs).toEqual([]);
  });

  test("a schema-violating add is rejected by canPatch", () => {
    const doc = createDoc();
    const m = createToggleOption(doc);

    // tags is string[]; adding a number must be rejected.
    const result = m.add("/tags", 5 as unknown as string);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
    expect(doc.value.tags).toEqual(["a", "b"]);
  });

  test("canToggle (plan) does not mutate", () => {
    const doc = createDoc();
    const result = expectOk(plan(doc, "/tags", "c", "toggle"));
    expect(result.action).toBe("added");
    expect(doc.value.tags).toEqual(["a", "b"]);
  });

  test("rejects a non-array path", () => {
    const doc = createDoc();
    const result = plan(doc, "/tags/0", "x", "toggle");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_array");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = plan(doc, "/missing", "x", "toggle");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
