import { describe, expect, test } from "vitest";

import {
  planAppendOnlyArrayAddPatch,
  planIndependentReplacePatch,
} from "../src/domain/schema/localPatch.js";
import type { JSONPatchOperation } from "../src/foundation/json-patch/index.js";

describe("local patch core functions", () => {
  test("plans independent replace batches without schema work", () => {
    expect(planIndependentReplacePatch({
      operations: [
        { op: "replace", path: "/title", value: "Final" },
        { op: "replace", path: "/meta/owner", value: "core" },
      ],
    })).toBe(true);
  });

  test("rejects patches that must keep the slower validation path", () => {
    expect(planIndependentReplacePatch({ operations: [] })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [{ op: "replace", path: "", value: { title: "root" } }],
    })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [{ op: "add", path: "/title", value: "Final" }],
    })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [{ op: "replace", path: "title", value: "Final" }],
    })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [{ op: "replace", path: "/items/-/name", value: "Final" }],
    })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [
        { op: "replace", path: "/items/0", value: { name: "A" } },
        { op: "replace", path: "/items/0/name", value: "A" },
      ],
    })).toBe(false);

    expect(planIndependentReplacePatch({
      operations: [
        { op: "replace", path: "/title", value: "A" },
        { op: "replace", path: "/title", value: "B" },
      ],
    })).toBe(false);

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/title", value: "Final" };
    expect(planIndependentReplacePatch({ operations: sparse })).toBe(false);
  });
});

describe("append-only array add patch planning", () => {
  test("plans repeated append operations for one array target", () => {
    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "add", path: "/items/-", value: "A" },
        { op: "add", path: "/items/-", value: "B" },
      ],
    })).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      values: ["A", "B"],
    });

    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "add", path: "/-", value: 1 },
        { op: "add", path: "/-", value: 2 },
      ],
    })).toEqual({
      parent: "",
      parentSegments: [],
      values: [1, 2],
    });
  });

  test("rejects append batches that need a slower local validation path", () => {
    expect(planAppendOnlyArrayAddPatch({
      operations: [{ op: "add", path: "/items/-", value: "A" }],
    })).toBeNull();

    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "add", path: "/items/-", value: "A" },
        { op: "add", path: "/other/-", value: "B" },
      ],
    })).toBeNull();

    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "add", path: "/items/0", value: "A" },
        { op: "add", path: "/items/1", value: "B" },
      ],
    })).toBeNull();

    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "replace", path: "/items/-", value: "A" },
        { op: "add", path: "/items/-", value: "B" },
      ],
    })).toBeNull();

    expect(planAppendOnlyArrayAddPatch({
      operations: [
        { op: "add", path: "items/-", value: "A" },
        { op: "add", path: "items/-", value: "B" },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "add", path: "/items/-", value: "B" };
    expect(planAppendOnlyArrayAddPatch({ operations: sparse })).toBeNull();
  });
});
