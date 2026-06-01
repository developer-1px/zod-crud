import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { canEnsure, createApplyDefaults, type ApplyDefaultsResult } from "../src/index.js";

// apply-defaults is meaningful when the defaultable keys are schema-optional, so
// the document is valid while they are absent. (A required key cannot be missing
// in the first place — createJSONDocument would reject the initial value.)
const Schema = z.object({
  settings: z.object({
    theme: z.string(),
    fontSize: z.number().optional(),
    compact: z.boolean().optional(),
  }),
  list: z.array(z.string()),
});

function createDoc(settings: { theme: string; fontSize?: number; compact?: boolean } = { theme: "light" }) {
  return createJSONDocument(Schema, { settings, list: [] });
}

function expectOk(result: ApplyDefaultsResult): Extract<ApplyDefaultsResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.reason}`);
  return result;
}

describe("@zod-crud/apply-defaults", () => {
  test("adds only the missing keys, preserving existing ones", () => {
    const doc = createDoc({ theme: "dark" });
    const e = createApplyDefaults(doc);

    const result = expectOk(e.ensure("/settings", { theme: "light", fontSize: 14, compact: false }));
    expect(result.added).toEqual(["fontSize", "compact"]);
    expect(doc.value.settings).toEqual({ theme: "dark", fontSize: 14, compact: false });
  });

  test("a fully-populated object is a no-op", () => {
    const doc = createDoc({ theme: "dark", fontSize: 16, compact: true });
    const e = createApplyDefaults(doc);

    const result = expectOk(e.ensure("/settings", { theme: "x", fontSize: 1, compact: false }));
    expect(result.changed).toBe(false);
    expect(result.added).toEqual([]);
    expect(doc.value.settings).toEqual({ theme: "dark", fontSize: 16, compact: true });
  });

  test("a default that violates the schema is rejected by canPatch", () => {
    const doc = createDoc({ theme: "dark", compact: false });
    const e = createApplyDefaults(doc);

    // fontSize must be a number; adding a string default must be rejected.
    const result = e.ensure("/settings", { fontSize: "big" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("patch_rejected");
  });

  test("canEnsure does not mutate", () => {
    const doc = createDoc({ theme: "dark" });
    const result = expectOk(canEnsure(doc, "/settings", { fontSize: 14, compact: false }));
    expect(result.added).toEqual(["fontSize", "compact"]);
    expect(doc.value.settings).toEqual({ theme: "dark" });
  });

  test("rejects a non-object path (array)", () => {
    const doc = createDoc();
    const result = canEnsure(doc, "/list", { a: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_object");
  });

  test("rejects a missing path", () => {
    const doc = createDoc();
    const result = canEnsure(doc, "/missing", { a: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("path_not_found");
  });
});
