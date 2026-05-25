import { describe, expect, test } from "vitest";

import {
  planDocumentLifecycleChange,
} from "../../../src/application/document/plan/change.js";

describe("document lifecycle core functions", () => {
  test("syncs lastPatch and clears history after successful replacement by default", () => {
    expect(planDocumentLifecycleChange({
      result: { ok: true },
      preserveHistory: false,
    })).toEqual({
      syncLastPatch: true,
      clearHistory: true,
    });
  });

  test("keeps history after successful load when preserveHistory is explicit", () => {
    expect(planDocumentLifecycleChange({
      result: { ok: true },
      preserveHistory: true,
    })).toEqual({
      syncLastPatch: true,
      clearHistory: false,
    });
  });

  test("does not touch lastPatch or history after failed lifecycle changes", () => {
    expect(planDocumentLifecycleChange({
      result: { ok: false, code: "schema_violation", reason: "invalid" },
      preserveHistory: false,
    })).toEqual({
      syncLastPatch: false,
      clearHistory: false,
    });
  });
});
