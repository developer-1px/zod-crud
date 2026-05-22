// #57 — applyPatch 가 touched path 외 subtree reference 를 유지해야 한다.

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { applyPatch } from "../src/api/index.js";

describe("#57 structural sharing", () => {
  const Schema = z.object({
    cells: z.record(z.string(), z.string()),
    tabs: z.object({ saved: z.record(z.string(), z.unknown()), active: z.string() }),
  });

  it("preserves untouched sibling subtree reference (root-level)", () => {
    const state = Schema.parse({ cells: { A1: "x" }, tabs: { saved: {}, active: "main" } });
    const r = applyPatch(Schema, state, [{ op: "replace", path: "/tabs/active", value: "draft" }]);
    expect(r.result.ok).toBe(true);
    if (!r.result.ok) return;
    expect(r.state.cells).toBe(state.cells); // untouched sibling ref preserved
  });

  it("preserves untouched nested subtree reference", () => {
    const state = Schema.parse({ cells: { A1: "x", B2: "y" }, tabs: { saved: { v1: { foo: 1 } }, active: "main" } });
    const r = applyPatch(Schema, state, [{ op: "replace", path: "/tabs/active", value: "v1" }]);
    expect(r.result.ok).toBe(true);
    if (!r.result.ok) return;
    expect(r.state.cells).toBe(state.cells);
    expect(r.state.tabs.saved).toBe(state.tabs.saved);
  });

  it("touched path produces new reference", () => {
    const state = Schema.parse({ cells: { A1: "x" }, tabs: { saved: {}, active: "main" } });
    const r = applyPatch(Schema, state, [{ op: "replace", path: "/cells/A1", value: "z" }]);
    expect(r.result.ok).toBe(true);
    if (!r.result.ok) return;
    expect(r.state.cells).not.toBe(state.cells);
    expect(r.state.tabs).toBe(state.tabs);
  });
});
