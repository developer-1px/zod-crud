import { describe, expect, test } from "vitest";

import { planDocumentPatchCall } from "../../../src/application/document/createJSONDocument.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/index.js";

describe("document patch core functions", () => {
  test("plans single patch operations as owned one-item arrays", () => {
    const operation = { op: "replace", path: "/title", value: "final" } satisfies JSONPatchOperation;

    const plan = planDocumentPatchCall({ operations: operation });

    expect(plan).toEqual({
      operations: [operation],
      operationsOwned: true,
    });
  });

  test("plans patch arrays without copying or claiming ownership", () => {
    const operations = [
      { op: "replace", path: "/title", value: "final" },
      { op: "add", path: "/tags/0", value: "draft" },
    ] satisfies JSONPatchOperation[];

    const plan = planDocumentPatchCall({ operations });

    expect(plan.operations).toBe(operations);
    expect(plan.operationsOwned).toBe(false);
  });
});
