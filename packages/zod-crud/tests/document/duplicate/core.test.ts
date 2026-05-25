import { describe, expect, test } from "vitest";

import { planDocumentDuplicateApplyResult } from "../../../src/application/document/createJSONDocumentInteractionPlan.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/types.js";

describe("document duplicate core functions", () => {
  test("maps successful duplicate application to the public duplicate result shape", () => {
    const state = {
      items: [
        { id: "a", name: "A" },
        { id: "a-copy", name: "A" },
      ],
    };
    const applied: JSONPatchOperation[] = [
      { op: "add", path: "/items/1", value: { id: "a-copy", name: "A" } },
    ];

    expect(planDocumentDuplicateApplyResult({
      result: { ok: true },
      state,
      applied,
      duplicatedTo: "/items/1",
    })).toEqual({
      ok: true,
      value: state,
      applied,
      duplicatedTo: "/items/1",
    });
  });

  test("keeps failed duplicate application errors unchanged", () => {
    expect(planDocumentDuplicateApplyResult({
      result: { ok: false, code: "not_serializable", reason: "function value" },
      state: { items: [] },
      applied: [],
      duplicatedTo: "/items/1",
    })).toEqual({
      ok: false,
      code: "not_serializable",
      reason: "function value",
    });
  });
});
