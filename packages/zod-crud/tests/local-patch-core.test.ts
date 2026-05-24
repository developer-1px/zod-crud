import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  applyPatchWithLocalSchemaValidation,
  planAppendOnlyArrayAddPatch,
  planIncreasingArrayAddPatch,
  planIndependentReplacePatch,
  planKnownJsonReplacePatch,
  planRootObjectReplacePatch,
  planRootRecordAddPatch,
  planRootRecordRemovePatch,
  planSameArrayElementReplacePatch,
  planSameArrayFieldReplacePatch,
  planSameArrayNestedReplacePatch,
  planSameArrayPatch,
  planSingleRootObjectReplacePatch,
  planSingleReplacePatch,
} from "../src/domain/schema/localPatch.js";
import type { JSONPatchOperation } from "../src/foundation/json-patch/index.js";

describe("single replace patch planning", () => {
  test("plans one non-root replace operation", () => {
    expect(planSingleReplacePatch({
      operations: [{ op: "replace", path: "/title", value: "Final" }],
    })).toEqual({
      operation: { op: "replace", path: "/title", value: "Final" },
    });

    expect(planSingleReplacePatch({
      operations: [{ op: "replace", path: "/a~1b", value: 1 }],
    })).toEqual({
      operation: { op: "replace", path: "/a~1b", value: 1 },
    });
  });

  test("rejects patches that are not one non-root replace operation", () => {
    expect(planSingleReplacePatch({ operations: [] })).toBeNull();

    expect(planSingleReplacePatch({
      operations: [
        { op: "replace", path: "/title", value: "A" },
        { op: "replace", path: "/owner", value: "B" },
      ],
    })).toBeNull();

    expect(planSingleReplacePatch({
      operations: [{ op: "replace", path: "", value: { title: "root" } }],
    })).toBeNull();

    expect(planSingleReplacePatch({
      operations: [{ op: "add", path: "/title", value: "Final" }],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(1);
    expect(planSingleReplacePatch({ operations: sparse })).toBeNull();
  });

  test("keeps single replace applied operation unchanged", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ title: z.string() }),
      { title: "Draft" },
      [{ op: "replace", path: "/title", value: "Final" }],
    );

    expect(result?.state).toEqual({ title: "Final" });
    expect(result?.applied).toEqual([{ op: "replace", path: "/title", value: "Final" }]);
  });
});

describe("single root object replace patch planning", () => {
  test("plans one existing plain root key replacement", () => {
    const operation = { op: "replace", path: "/title", value: "Final" } as const;

    expect(planSingleRootObjectReplacePatch({
      sourceKeys: ["title", "owner"],
      operation,
    })).toEqual({
      operation,
      key: "title",
    });
  });

  test("rejects replacements outside existing plain root keys", () => {
    expect(planSingleRootObjectReplacePatch({
      sourceKeys: ["title"],
      operation: { op: "replace", path: "/missing", value: "Final" },
    })).toBeNull();

    expect(planSingleRootObjectReplacePatch({
      sourceKeys: [""],
      operation: { op: "replace", path: "/", value: "Final" },
    })).toBeNull();

    expect(planSingleRootObjectReplacePatch({
      sourceKeys: ["title"],
      operation: { op: "replace", path: "/title/nested", value: "Final" },
    })).toBeNull();

    expect(planSingleRootObjectReplacePatch({
      sourceKeys: ["a/b"],
      operation: { op: "replace", path: "/a~1b", value: "Final" },
    })).toBeNull();

    expect(planSingleRootObjectReplacePatch({
      sourceKeys: ["title"],
      operation: { op: "add", path: "/title", value: "Final" },
    })).toBeNull();
  });

  test("keeps single root object replace applied operation unchanged", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ title: z.string(), owner: z.string() }),
      { title: "Draft", owner: "core" },
      [{ op: "replace", path: "/title", value: "Final" }],
    );

    expect(result?.state).toEqual({ title: "Final", owner: "core" });
    expect(result?.applied).toEqual([{ op: "replace", path: "/title", value: "Final" }]);
  });
});

describe("known-json replace patch planning", () => {
  test("plans replace operations before schema-specific known-json checks", () => {
    expect(planKnownJsonReplacePatch({
      operations: [
        { op: "replace", path: "/title", value: "Final" },
        { op: "replace", path: "/meta/owner", value: "core" },
      ],
    })).toEqual({
      operations: [
        { op: "replace", path: "/title", value: "Final" },
        { op: "replace", path: "/meta/owner", value: "core" },
      ],
    });

    expect(planKnownJsonReplacePatch({
      operations: [{ op: "replace", path: "", value: { title: "root" } }],
    })).toEqual({
      operations: [{ op: "replace", path: "", value: { title: "root" } }],
    });
  });

  test("rejects patches that are not replace-only operation lists", () => {
    expect(planKnownJsonReplacePatch({ operations: [] })).toBeNull();

    expect(planKnownJsonReplacePatch({
      operations: [{ op: "add", path: "/title", value: "Final" }],
    })).toBeNull();

    expect(planKnownJsonReplacePatch({
      operations: [{ op: "replace", path: "/title" } as JSONPatchOperation],
    })).toBeNull();

    expect(planKnownJsonReplacePatch({
      operations: [{ op: "replace", path: 1, value: "Final" } as unknown as JSONPatchOperation],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/title", value: "Final" };
    expect(planKnownJsonReplacePatch({ operations: sparse })).toBeNull();
  });
});

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

describe("increasing array add patch planning", () => {
  test("plans contiguous indexed add operations for one array target", () => {
    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/1", value: "A" },
        { op: "add", path: "/items/2", value: "B" },
      ],
    })).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      start: 1,
      values: ["A", "B"],
    });

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/0", value: 1 },
        { op: "add", path: "/1", value: 2 },
      ],
    })).toEqual({
      parent: "",
      parentSegments: [],
      start: 0,
      values: [1, 2],
    });

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/a~1b/0", value: "A" },
        { op: "add", path: "/a~1b/1", value: "B" },
      ],
    })).toEqual({
      parent: "/a~1b",
      parentSegments: ["a/b"],
      start: 0,
      values: ["A", "B"],
    });
  });

  test("rejects indexed add batches that are not contiguous in one parent", () => {
    expect(planIncreasingArrayAddPatch({
      operations: [{ op: "add", path: "/items/0", value: "A" }],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/-", value: "A" },
        { op: "add", path: "/items/-", value: "B" },
      ],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/0", value: "A" },
        { op: "add", path: "/items/2", value: "B" },
      ],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/1", value: "A" },
        { op: "add", path: "/items/0", value: "B" },
      ],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/0", value: "A" },
        { op: "add", path: "/other/1", value: "B" },
      ],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "add", path: "/items/01", value: "A" },
        { op: "add", path: "/items/2", value: "B" },
      ],
    })).toBeNull();

    expect(planIncreasingArrayAddPatch({
      operations: [
        { op: "replace", path: "/items/0", value: "A" },
        { op: "add", path: "/items/1", value: "B" },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "add", path: "/items/1", value: "B" };
    expect(planIncreasingArrayAddPatch({ operations: sparse })).toBeNull();
  });
});

describe("same array patch planning", () => {
  test("plans add, remove, copy, and move operations in one array parent", () => {
    expect(planSameArrayPatch({
      operations: [
        { op: "remove", path: "/items/1" },
        { op: "add", path: "/items/-", value: "A" },
        { op: "copy", from: "/items/0", path: "/items/2" },
        { op: "move", from: "/items/2", path: "/items/0" },
      ],
    })).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      operations: [
        { op: "remove", path: "/items/1", index: 1 },
        { op: "add", path: "/items/-", index: "-", value: "A" },
        { op: "copy", from: "/items/0", path: "/items/2", fromIndex: 0, index: 2 },
        { op: "move", from: "/items/2", path: "/items/0", fromIndex: 2, index: 0 },
      ],
    });
  });

  test("plans root and escaped parent array operations", () => {
    expect(planSameArrayPatch({
      operations: [
        { op: "copy", from: "/0", path: "/-" },
      ],
    })).toEqual({
      parent: "",
      parentSegments: [],
      operations: [
        { op: "copy", from: "/0", path: "/-", fromIndex: 0, index: "-" },
      ],
    });

    expect(planSameArrayPatch({
      operations: [
        { op: "move", from: "/a~1b/0", path: "/a~1b/-" },
      ],
    })).toEqual({
      parent: "/a~1b",
      parentSegments: ["a/b"],
      operations: [
        { op: "move", from: "/a~1b/0", path: "/a~1b/-", fromIndex: 0, index: "-" },
      ],
    });
  });

  test("rejects operations outside one array parent", () => {
    expect(planSameArrayPatch({ operations: [] })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "replace", path: "/items/0", value: "A" },
      ],
    })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "add", path: "/items/0", value: "A" },
        { op: "remove", path: "/other/0" },
      ],
    })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "remove", path: "/items/-" },
      ],
    })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "copy", from: "/other/0", path: "/items/0" },
      ],
    })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "move", from: "/items/-", path: "/items/0" },
      ],
    })).toBeNull();

    expect(planSameArrayPatch({
      operations: [
        { op: "add", path: "/items/01", value: "A" },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "remove", path: "/items/1" };
    expect(planSameArrayPatch({ operations: sparse })).toBeNull();
  });
});

describe("root record add patch planning", () => {
  test("plans root-level record add operations", () => {
    expect(planRootRecordAddPatch({
      operations: [
        { op: "add", path: "/alpha", value: 1 },
        { op: "add", path: "/", value: "empty-key" },
        { op: "add", path: "/__proto__", value: "data-key" },
      ],
    })).toEqual({
      operations: [
        { op: "add", path: "/alpha", key: "alpha", value: 1 },
        { op: "add", path: "/", key: "", value: "empty-key" },
        { op: "add", path: "/__proto__", key: "__proto__", value: "data-key" },
      ],
    });
  });

  test("rejects adds that are not plain root record keys", () => {
    expect(planRootRecordAddPatch({ operations: [] })).toBeNull();

    expect(planRootRecordAddPatch({
      operations: [{ op: "add", path: "", value: "root" }],
    })).toBeNull();

    expect(planRootRecordAddPatch({
      operations: [{ op: "replace", path: "/alpha", value: 1 }],
    })).toBeNull();

    expect(planRootRecordAddPatch({
      operations: [{ op: "add", path: "/alpha/nested", value: 1 }],
    })).toBeNull();

    expect(planRootRecordAddPatch({
      operations: [{ op: "add", path: "/a~1b", value: 1 }],
    })).toBeNull();

    expect(planRootRecordAddPatch({
      operations: [{ op: "add", path: "alpha", value: 1 }],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "add", path: "/alpha", value: 1 };
    expect(planRootRecordAddPatch({ operations: sparse })).toBeNull();
  });
});

describe("root record remove patch planning", () => {
  test("plans removal strategies from source key order", () => {
    expect(planRootRecordRemovePatch({
      sourceKeys: ["a", "b", "c"],
      operations: [{ op: "remove", path: "/b" }],
    })).toEqual({
      operations: [{ op: "remove", path: "/b", key: "b" }],
      strategy: "copyDelete",
      keepCount: 2,
    });

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a", "b", "c"],
      operations: [{ op: "remove", path: "/c" }],
    })).toEqual({
      operations: [{ op: "remove", path: "/c", key: "c" }],
      strategy: "copyPrefix",
      keepCount: 2,
    });

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a", "b", "c"],
      operations: [
        { op: "remove", path: "/b" },
        { op: "remove", path: "/c" },
      ],
    })).toEqual({
      operations: [
        { op: "remove", path: "/b", key: "b" },
        { op: "remove", path: "/c", key: "c" },
      ],
      strategy: "copyPrefix",
      keepCount: 1,
    });

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a", "b", "c", "d"],
      operations: [
        { op: "remove", path: "/a" },
        { op: "remove", path: "/c" },
      ],
    })).toEqual({
      operations: [
        { op: "remove", path: "/a", key: "a" },
        { op: "remove", path: "/c", key: "c" },
      ],
      strategy: "rebuild",
      keepCount: 2,
    });

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a", "b"],
      operations: [
        { op: "remove", path: "/b" },
        { op: "remove", path: "/a" },
      ],
    })).toEqual({
      operations: [
        { op: "remove", path: "/b", key: "b" },
        { op: "remove", path: "/a", key: "a" },
      ],
      strategy: "clear",
      keepCount: 0,
    });
  });

  test("rejects remove batches that are not plain existing root keys", () => {
    expect(planRootRecordRemovePatch({ sourceKeys: ["a"], operations: [] })).toBeNull();

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a"],
      operations: [{ op: "remove", path: "/missing" }],
    })).toBeNull();

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a"],
      operations: [
        { op: "remove", path: "/a" },
        { op: "remove", path: "/a" },
      ],
    })).toBeNull();

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a"],
      operations: [{ op: "remove", path: "/a/nested" }],
    })).toBeNull();

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a/b"],
      operations: [{ op: "remove", path: "/a~1b" }],
    })).toBeNull();

    expect(planRootRecordRemovePatch({
      sourceKeys: ["a"],
      operations: [{ op: "add", path: "/a", value: 1 }],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "remove", path: "/a" };
    expect(planRootRecordRemovePatch({ sourceKeys: ["a"], operations: sparse })).toBeNull();
  });

  test("keeps root record add applied operations free of planner-only keys", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.record(z.string(), z.number()),
      {},
      [{ op: "add", path: "/alpha", value: 1 }],
    );

    expect(result?.applied).toEqual([{ op: "add", path: "/alpha", value: 1 }]);
    expect(result?.applied[0]).not.toHaveProperty("key");
  });
});

describe("root object replace patch planning", () => {
  test("plans ordered full-root replacement and copy-write replacement", () => {
    expect(planRootObjectReplacePatch({
      sourceKeys: ["a", "b"],
      operations: [
        { op: "replace", path: "/a", value: 1 },
        { op: "replace", path: "/b", value: 2 },
      ],
    })).toEqual({
      operations: [
        { op: "replace", path: "/a", key: "a", value: 1 },
        { op: "replace", path: "/b", key: "b", value: 2 },
      ],
      strategy: "orderedReplace",
    });

    expect(planRootObjectReplacePatch({
      sourceKeys: ["a", "b", "c"],
      operations: [
        { op: "replace", path: "/b", value: 2 },
        { op: "replace", path: "/a", value: 1 },
      ],
    })).toEqual({
      operations: [
        { op: "replace", path: "/b", key: "b", value: 2 },
        { op: "replace", path: "/a", key: "a", value: 1 },
      ],
      strategy: "copyWrite",
    });
  });

  test("rejects replacements outside existing plain root keys", () => {
    expect(planRootObjectReplacePatch({
      sourceKeys: ["a"],
      operations: [{ op: "replace", path: "/a", value: 1 }],
    })).toBeNull();

    expect(planRootObjectReplacePatch({
      sourceKeys: ["a"],
      operations: [
        { op: "replace", path: "/a", value: 1 },
        { op: "replace", path: "/missing", value: 2 },
      ],
    })).toBeNull();

    expect(planRootObjectReplacePatch({
      sourceKeys: [""],
      operations: [
        { op: "replace", path: "/", value: 1 },
        { op: "replace", path: "/", value: 2 },
      ],
    })).toBeNull();

    expect(planRootObjectReplacePatch({
      sourceKeys: ["a"],
      operations: [
        { op: "replace", path: "/a", value: 1 },
        { op: "replace", path: "/a/nested", value: 2 },
      ],
    })).toBeNull();

    expect(planRootObjectReplacePatch({
      sourceKeys: ["a/b"],
      operations: [
        { op: "replace", path: "/a~1b", value: 1 },
        { op: "replace", path: "/a~1b", value: 2 },
      ],
    })).toBeNull();

    expect(planRootObjectReplacePatch({
      sourceKeys: ["a"],
      operations: [
        { op: "add", path: "/a", value: 1 },
        { op: "replace", path: "/a", value: 2 },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/a", value: 1 };
    expect(planRootObjectReplacePatch({ sourceKeys: ["a"], operations: sparse })).toBeNull();
  });

  test("keeps root object replace applied operations free of planner-only keys", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ a: z.number(), b: z.number() }),
      { a: 0, b: 0 },
      [
        { op: "replace", path: "/a", value: 1 },
        { op: "replace", path: "/b", value: 2 },
      ],
    );

    expect(result?.applied).toEqual([
      { op: "replace", path: "/a", value: 1 },
      { op: "replace", path: "/b", value: 2 },
    ]);
    expect(result?.applied[0]).not.toHaveProperty("key");
  });
});

describe("same array field replace patch planning", () => {
  test("plans same-field replacements across one array", () => {
    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/items/2/name", value: "B" },
      ],
    })).toEqual({
      arrayPath: "/items",
      arraySegments: ["items"],
      field: "name",
      operations: [
        { op: "replace", path: "/items/0/name", index: 0, value: "A" },
        { op: "replace", path: "/items/2/name", index: 2, value: "B" },
      ],
    });

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/0/title", value: "A" },
        { op: "replace", path: "/1/title", value: "B" },
      ],
    })).toEqual({
      arrayPath: "",
      arraySegments: [],
      field: "title",
      operations: [
        { op: "replace", path: "/0/title", index: 0, value: "A" },
        { op: "replace", path: "/1/title", index: 1, value: "B" },
      ],
    });

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/a~1b/0/x~1y", value: "A" },
        { op: "replace", path: "/a~1b/1/x~1y", value: "B" },
      ],
    })).toEqual({
      arrayPath: "/a~1b",
      arraySegments: ["a/b"],
      field: "x/y",
      operations: [
        { op: "replace", path: "/a~1b/0/x~1y", index: 0, value: "A" },
        { op: "replace", path: "/a~1b/1/x~1y", index: 1, value: "B" },
      ],
    });
  });

  test("rejects replacements that are not one field across one array", () => {
    expect(planSameArrayFieldReplacePatch({
      operations: [{ op: "replace", path: "/items/0/name", value: "A" }],
    })).toBeNull();

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/items/1/title", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/other/1/name", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/items/01/name", value: "A" },
        { op: "replace", path: "/items/2/name", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "replace", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/items/1/name/first", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayFieldReplacePatch({
      operations: [
        { op: "add", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/items/1/name", value: "B" },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/items/1/name", value: "B" };
    expect(planSameArrayFieldReplacePatch({ operations: sparse })).toBeNull();
  });

  test("keeps same-array field replace applied operations free of planner-only indexes", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.object({ name: z.string(), done: z.boolean() })) }),
      { items: [{ name: "old", done: false }, { name: "old", done: true }] },
      [
        { op: "replace", path: "/items/0/name", value: "A" },
        { op: "replace", path: "/items/1/name", value: "B" },
      ],
    );

    expect(result?.applied).toEqual([
      { op: "replace", path: "/items/0/name", value: "A" },
      { op: "replace", path: "/items/1/name", value: "B" },
    ]);
    expect(result?.applied[0]).not.toHaveProperty("index");
  });
});

describe("same array element replace patch planning", () => {
  test("plans element replacements across one array", () => {
    expect(planSameArrayElementReplacePatch({
      operations: [
        { op: "replace", path: "/items/0", value: "A" },
        { op: "replace", path: "/items/2", value: "B" },
      ],
    })).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      operations: [
        { op: "replace", path: "/items/0", index: 0, value: "A" },
        { op: "replace", path: "/items/2", index: 2, value: "B" },
      ],
    });

    expect(planSameArrayElementReplacePatch({
      operations: [
        { op: "replace", path: "/0", value: 1 },
        { op: "replace", path: "/1", value: 2 },
      ],
    })).toEqual({
      parent: "",
      parentSegments: [],
      operations: [
        { op: "replace", path: "/0", index: 0, value: 1 },
        { op: "replace", path: "/1", index: 1, value: 2 },
      ],
    });

    expect(planSameArrayElementReplacePatch({
      operations: [
        { op: "replace", path: "/a~1b/0", value: "A" },
        { op: "replace", path: "/a~1b/1", value: "B" },
      ],
    })).toEqual({
      parent: "/a~1b",
      parentSegments: ["a/b"],
      operations: [
        { op: "replace", path: "/a~1b/0", index: 0, value: "A" },
        { op: "replace", path: "/a~1b/1", index: 1, value: "B" },
      ],
    });
  });

  test("rejects replacements that are not direct elements in one array", () => {
    expect(planSameArrayElementReplacePatch({ operations: [] })).toBeNull();

    expect(planSameArrayElementReplacePatch({
      operations: [{ op: "add", path: "/items/0", value: "A" }],
    })).toBeNull();

    expect(planSameArrayElementReplacePatch({
      operations: [{ op: "replace", path: "/items/0/name", value: "A" }],
    })).toBeNull();

    expect(planSameArrayElementReplacePatch({
      operations: [
        { op: "replace", path: "/items/0", value: "A" },
        { op: "replace", path: "/other/1", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayElementReplacePatch({
      operations: [{ op: "replace", path: "/items/01", value: "A" }],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/items/1", value: "B" };
    expect(planSameArrayElementReplacePatch({ operations: sparse })).toBeNull();
  });

  test("keeps same-array element replace applied operations free of planner-only indexes", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.number()) }),
      { items: [0, 1] },
      [
        { op: "replace", path: "/items/0", value: 10 },
        { op: "replace", path: "/items/1", value: 11 },
      ],
    );

    expect(result?.applied).toEqual([
      { op: "replace", path: "/items/0", value: 10 },
      { op: "replace", path: "/items/1", value: 11 },
    ]);
    expect(result?.applied[0]).not.toHaveProperty("index");
  });
});

describe("same array nested replace patch planning", () => {
  test("plans nested replacements across one array", () => {
    const state = {
      items: [
        { meta: { title: "old" } },
        { meta: { title: "old" } },
      ],
    };

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [
        { op: "replace", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/items/1/meta/title", value: "B" },
      ],
    })).toEqual({
      arrayPath: "/items",
      arraySegments: ["items"],
      suffixSegments: ["meta", "title"],
      operations: [
        { op: "replace", path: "/items/0/meta/title", index: 0, value: "A" },
        { op: "replace", path: "/items/1/meta/title", index: 1, value: "B" },
      ],
    });

    expect(planSameArrayNestedReplacePatch({
      state: [{ meta: { title: "old" } }, { meta: { title: "old" } }],
      operations: [
        { op: "replace", path: "/0/meta/title", value: "A" },
        { op: "replace", path: "/1/meta/title", value: "B" },
      ],
    })).toEqual({
      arrayPath: "",
      arraySegments: [],
      suffixSegments: ["meta", "title"],
      operations: [
        { op: "replace", path: "/0/meta/title", index: 0, value: "A" },
        { op: "replace", path: "/1/meta/title", index: 1, value: "B" },
      ],
    });

    expect(planSameArrayNestedReplacePatch({
      state: {
        "a/b": [
          { "x/y": { value: 0 } },
          { "x/y": { value: 1 } },
        ],
      },
      operations: [
        { op: "replace", path: "/a~1b/0/x~1y/value", value: 10 },
        { op: "replace", path: "/a~1b/1/x~1y/value", value: 11 },
      ],
    })).toEqual({
      arrayPath: "/a~1b",
      arraySegments: ["a/b"],
      suffixSegments: ["x/y", "value"],
      operations: [
        { op: "replace", path: "/a~1b/0/x~1y/value", index: 0, value: 10 },
        { op: "replace", path: "/a~1b/1/x~1y/value", index: 1, value: 11 },
      ],
    });
  });

  test("rejects nested replacements outside one array suffix", () => {
    const state = {
      items: [
        { meta: { title: "old", label: "old" } },
        { meta: { title: "old", label: "old" } },
      ],
      other: [
        { meta: { title: "old" } },
        { meta: { title: "old" } },
      ],
    };

    expect(planSameArrayNestedReplacePatch({ state, operations: [] })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [{ op: "replace", path: "/items/0/meta/title", value: "A" }],
    })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [
        { op: "replace", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/items/1/meta/label", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [
        { op: "replace", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/other/1/meta/title", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state: { items: { 0: { meta: { title: "old" } } } },
      operations: [
        { op: "replace", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/items/1/meta/title", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [
        { op: "add", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/items/1/meta/title", value: "B" },
      ],
    })).toBeNull();

    expect(planSameArrayNestedReplacePatch({
      state,
      operations: [
        { op: "replace", path: "/items/01/meta/title", value: "A" },
        { op: "replace", path: "/items/2/meta/title", value: "B" },
      ],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/items/1/meta/title", value: "B" };
    expect(planSameArrayNestedReplacePatch({ state, operations: sparse })).toBeNull();
  });

  test("keeps same-array nested replace applied operations free of planner-only indexes", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.object({ meta: z.object({ title: z.string() }) })) }),
      { items: [{ meta: { title: "old" } }, { meta: { title: "old" } }] },
      [
        { op: "replace", path: "/items/0/meta/title", value: "A" },
        { op: "replace", path: "/items/1/meta/title", value: "B" },
      ],
    );

    expect(result?.applied).toEqual([
      { op: "replace", path: "/items/0/meta/title", value: "A" },
      { op: "replace", path: "/items/1/meta/title", value: "B" },
    ]);
    expect(result?.applied[0]).not.toHaveProperty("index");
  });
});
