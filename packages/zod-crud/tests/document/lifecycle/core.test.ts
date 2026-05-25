import { describe, expect, test } from "vitest";

import {
  planDocumentLastPatch,
  planDocumentLifecycleChange,
} from "../../../src/application/document/createJSONDocumentChangePlan.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/index.js";

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

  test("plans lastPatch without leaking stale applied patches for no-op changes", () => {
    const applied: JSONPatchOperation[] = [{ op: "replace", path: "/title", value: "final" }];

    expect(planDocumentLastPatch({ operationCount: 0, applied })).toEqual([]);
    expect(planDocumentLastPatch({ operationCount: 1, applied })).toBe(applied);
  });
});
