import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  acceptsKnownJsonValue,
  applyArrayAddPlan,
  applyArrayIndexReplacements,
  applyArrayNestedReplacements,
  applyRootObjectReplacePlan,
  applyRootRecordAddPlan,
  applyRootRecordRemovePlan,
  applyPatchWithLocalSchemaValidation,
  applySequentialLocalOperation,
  appendArrayIndexPath,
  arrayElementSchemaAtParent,
  arrayElementSchemaAtPath,
  arrayIndexInParent,
  arrayIndexPathLocation,
  buildKnownJsonArrayIndexReplacements,
  buildValidatedArrayIndexReplacements,
  createDataKeySet,
  copyRootRecordKeyPrefix,
  evaluateAppliedAddValueValidationPlan,
  evaluateAppliedLocalOpValidationPlan,
  evaluateAppliedReplaceOperations,
  evaluateAppliedReplaceValueValidationPlan,
  evaluateArrayAddElementValues,
  evaluateKnownJsonReplaceValues,
  evaluateLocalPatchValueValidationPlan,
  evaluateRootRecordAddValues,
  evaluateRootObjectReplaceValues,
  failedLocalPatch,
  numericSegment,
  okLocalPatch,
  planAppliedLocalOpValidation,
  planArrayAddAppliedOperations,
  planAppendOnlyArrayAddPatch,
  planIncreasingArrayAddPatch,
  planIndependentReplacePatch,
  planKnownJsonReplacePatch,
  planLocalPatchValueValidation,
  planRootObjectReplacePatch,
  planRootRecordAddPatch,
  planRootRecordRemovePatch,
  planSameArrayElementReplacePatch,
  planSameArrayFieldReplacePatch,
  planSameArrayNestedReplacePatch,
  planSameArrayPatch,
  planSequentialPatch,
  planSingleRootObjectReplacePatch,
  planSingleReplacePatch,
  prefixIssues,
  readAppliedLocalOpSourceValue,
  replaceObjectDataValue,
  replaceValueAtSegments,
  rootRecordValueSchemaForLocalPatch,
  toAppliedAddOperations,
  toAppliedRemoveOperations,
  toAppliedReplaceOperations,
  writeObjectDataValue,
  writeRootRecordValue,
} from "../src/domain/schema/localPatch.js";
import type { JSONPatchOperation } from "../src/foundation/json-patch/index.js";

describe("local patch value validation planning", () => {
  test("accepts known-json values without schema parsing", () => {
    expect(planLocalPatchValueValidation({
      path: "/title",
      schema: z.string(),
      value: "Final",
      knownJsonAccepted: true,
      valuesTrusted: false,
    })).toEqual({ kind: "accepted" });
  });

  test("plans schema parsing for serializable values that are not known-json accepted", () => {
    const result = planLocalPatchValueValidation({
      path: "/title",
      schema: z.string(),
      value: 1,
      knownJsonAccepted: false,
      valuesTrusted: false,
    });

    expect(result).toMatchObject({ kind: "parse", path: "/title", value: 1 });
    expect(result.kind === "parse" && result.schema.safeParse(result.value).success).toBe(false);
  });

  test("rejects untrusted non-serializable values before schema parsing", () => {
    const result = planLocalPatchValueValidation({
      path: "/title",
      schema: z.unknown(),
      value: () => "not json",
      knownJsonAccepted: false,
      valuesTrusted: false,
    });

    expect(result).toMatchObject({
      kind: "notSerializable",
      reason: expect.stringContaining("function"),
    });
  });

  test("trusts caller-owned serializability and falls back to schema parsing", () => {
    const value = () => "trusted";
    const result = planLocalPatchValueValidation({
      path: "/value",
      schema: z.function(),
      value,
      knownJsonAccepted: false,
      valuesTrusted: true,
    });

    expect(result).toMatchObject({ kind: "parse", path: "/value", value });
  });
});

describe("array add applied operation validation", () => {
  test("plans applied add operations from a parent, start index, and values", () => {
    expect(planArrayAddAppliedOperations({
      parent: "/items",
      start: 2,
      values: ["A", "B"],
    })).toEqual([
      { op: "add", path: "/items/2", value: "A" },
      { op: "add", path: "/items/3", value: "B" },
    ]);

    expect(planArrayAddAppliedOperations({
      parent: "",
      start: 0,
      values: [1],
    })).toEqual([{ op: "add", path: "/0", value: 1 }]);
  });

  test("accepts applied add values when known-json validation accepts them", () => {
    const state = { items: [] as unknown[] };
    const operations = [{ op: "add" as const, path: "/items/0", value: "A", index: 0 }];

    expect(evaluateAppliedAddValueValidationPlan(
      state,
      operations,
      z.never(),
      () => true,
      false,
    )).toBeNull();
  });

  test("validates applied array add values through parent element schemas", () => {
    const state = { items: [] as string[] };

    expect(evaluateArrayAddElementValues({
      schema: z.object({ items: z.array(z.string()) }),
      state,
      parent: "/items",
      operations: [{ op: "add", path: "/items/0", value: "A" }],
      valuesTrusted: false,
    })).toEqual({ ok: true });

    expect(evaluateArrayAddElementValues({
      schema: z.object({ title: z.string() }),
      state: { title: "Draft" },
      parent: "/title",
      operations: [{ op: "add", path: "/title/0", value: "A" }],
      valuesTrusted: false,
    })).toEqual({ ok: false, result: null });
  });

  test("returns applied array add value validation failures", () => {
    const state = { items: [] as string[] };
    const result = evaluateArrayAddElementValues({
      schema: z.object({ items: z.array(z.string()) }),
      state,
      parent: "/items",
      operations: [{ op: "add", path: "/items/0", value: 1 }],
      valuesTrusted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });

  test("strips planner-only metadata from applied add operations", () => {
    const operations = [
      { op: "add" as const, path: "/items/0", value: "A", index: 0 },
      { op: "add" as const, path: "/items/1", value: "B", key: "ignored" },
    ];

    expect(toAppliedAddOperations(operations)).toEqual([
      { op: "add", path: "/items/0", value: "A" },
      { op: "add", path: "/items/1", value: "B" },
    ]);
  });

  test("rejects untrusted non-serializable applied add values before schema parsing", () => {
    const state = { items: [] as unknown[] };

    const result = evaluateAppliedAddValueValidationPlan(
      state,
      [{ op: "add", path: "/items/0", value: () => "not json" }],
      z.unknown(),
      () => false,
      false,
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
  });
});

describe("array add state materialization", () => {
  test("applies array add plans to root and nested arrays without mutating the source", () => {
    const state = { items: ["A", "D"], meta: { keep: true } };

    expect(applyArrayAddPlan({
      state,
      parentSegments: ["items"],
      array: state.items,
      start: 1,
      values: ["B", "C"],
    })).toEqual({ items: ["A", "B", "C", "D"], meta: { keep: true } });
    expect(state.items).toEqual(["A", "D"]);

    const root = ["A"];
    expect(applyArrayAddPlan({
      state: root,
      parentSegments: [],
      array: root,
      start: 1,
      values: ["B"],
    })).toEqual(["A", "B"]);
    expect(root).toEqual(["A"]);
  });

  test("rejects array add plans outside the current array bounds", () => {
    const state = { items: ["A"] };

    expect(applyArrayAddPlan({
      state,
      parentSegments: ["items"],
      array: state.items,
      start: -1,
      values: ["B"],
    })).toBeNull();

    expect(applyArrayAddPlan({
      state,
      parentSegments: ["items"],
      array: state.items,
      start: 2,
      values: ["B"],
    })).toBeNull();
  });
});

describe("array index replacement state materialization", () => {
  test("applies index replacements to root and nested arrays without mutating the source", () => {
    const state = { items: ["A", "B"], meta: { keep: true } };

    expect(applyArrayIndexReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      replacements: [
        { index: 0, value: "X" },
        { index: 1, value: "Y" },
      ],
    })).toEqual({ items: ["X", "Y"], meta: { keep: true } });
    expect(state.items).toEqual(["A", "B"]);

    const root = ["A", "B"];
    expect(applyArrayIndexReplacements({
      state: root,
      arraySegments: [],
      array: root,
      replacements: [{ index: 1, value: "Z" }],
    })).toEqual(["A", "Z"]);
    expect(root).toEqual(["A", "B"]);
  });

  test("rejects index replacements outside the current array bounds", () => {
    const state = { items: ["A"] };

    expect(applyArrayIndexReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      replacements: [{ index: -1, value: "B" }],
    })).toBeNull();

    expect(applyArrayIndexReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      replacements: [{ index: 1, value: "B" }],
    })).toBeNull();
  });
});

describe("validated array index replacement planning", () => {
  test("builds replacements after index, materialization, and value validation", () => {
    const state = { items: [{ name: "old-a" }, { name: "old-b" }] };
    const result = buildValidatedArrayIndexReplacements({
      state,
      array: state.items,
      operations: [
        { op: "replace", path: "/items/0/name", index: 0, value: "A" },
        { op: "replace", path: "/items/1/name", index: 1, value: "B" },
      ],
      valueSchema: z.string(),
      valuesTrusted: false,
      replacementValue: (op, currentValue) => {
        const replaced = replaceObjectDataValue(currentValue, "name", op.value);
        return replaced === null ? { ok: false } : { ok: true, value: replaced };
      },
    });

    expect(result).toEqual({
      ok: true,
      replacements: [
        { index: 0, value: { name: "A" } },
        { index: 1, value: { name: "B" } },
      ],
    });
    expect(state.items).toEqual([{ name: "old-a" }, { name: "old-b" }]);
  });

  test("returns null results for invalid indexes and replacement values", () => {
    const state = { items: [{ name: "old" }] };

    expect(buildValidatedArrayIndexReplacements({
      state,
      array: state.items,
      operations: [{ op: "replace", path: "/items/1/name", index: 1, value: "A" }],
      valueSchema: z.string(),
      valuesTrusted: false,
      replacementValue: (op) => ({ ok: true, value: op.value }),
    })).toEqual({ ok: false, result: null });

    expect(buildValidatedArrayIndexReplacements({
      state,
      array: [1],
      operations: [{ op: "replace", path: "/items/0/name", index: 0, value: "A" }],
      valueSchema: z.string(),
      valuesTrusted: false,
      replacementValue: (op, currentValue) => {
        const replaced = replaceObjectDataValue(currentValue, "name", op.value);
        return replaced === null ? { ok: false } : { ok: true, value: replaced };
      },
    })).toEqual({ ok: false, result: null });
  });

  test("returns replace value validation failures", () => {
    const state = { items: [{ name: "old" }] };
    const result = buildValidatedArrayIndexReplacements({
      state,
      array: state.items,
      operations: [{ op: "replace", path: "/items/0/name", index: 0, value: 1 }],
      valueSchema: z.string(),
      valuesTrusted: false,
      replacementValue: (op) => ({ ok: true, value: { name: op.value } }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });
});

describe("known-json array index replacement planning", () => {
  test("builds replacements from schema-accepted known-json values", () => {
    const array = ["old-a", "old-b"];

    expect(buildKnownJsonArrayIndexReplacements({
      schema: z.string(),
      array,
      operations: [
        { op: "replace", path: "/items/0", index: 0, value: "A" },
        { op: "replace", path: "/items/1", index: 1, value: "B" },
      ],
    })).toEqual([
      { index: 0, value: "A" },
      { index: 1, value: "B" },
    ]);
    expect(array).toEqual(["old-a", "old-b"]);
  });

  test("rejects out-of-bounds indexes and values outside known-json schemas", () => {
    expect(buildKnownJsonArrayIndexReplacements({
      schema: z.string(),
      array: ["old"],
      operations: [{ op: "replace", path: "/items/1", index: 1, value: "A" }],
    })).toBeNull();

    expect(buildKnownJsonArrayIndexReplacements({
      schema: z.string(),
      array: ["old"],
      operations: [{ op: "replace", path: "/items/0", index: 0, value: 1 }],
    })).toBeNull();
  });
});

describe("array nested replacement state materialization", () => {
  test("applies nested replacements to root and nested arrays without mutating the source", () => {
    const state = {
      items: [
        { meta: { title: "old-a" } },
        { meta: { title: "old-b" } },
      ],
      keep: true,
    };

    expect(applyArrayNestedReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      suffixSegments: ["meta", "title"],
      replacements: [
        { index: 0, value: "A" },
        { index: 1, value: "B" },
      ],
    })).toEqual({
      items: [
        { meta: { title: "A" } },
        { meta: { title: "B" } },
      ],
      keep: true,
    });
    expect(state.items[0]?.meta.title).toBe("old-a");

    const root = [{ meta: { title: "old" } }];
    expect(applyArrayNestedReplacements({
      state: root,
      arraySegments: [],
      array: root,
      suffixSegments: ["meta", "title"],
      replacements: [{ index: 0, value: "Root" }],
    })).toEqual([{ meta: { title: "Root" } }]);
    expect(root[0]?.meta.title).toBe("old");
  });

  test("rejects nested replacements outside the current array or suffix path", () => {
    const state = { items: [{ meta: { title: "old" } }] };

    expect(applyArrayNestedReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      suffixSegments: ["meta", "title"],
      replacements: [{ index: 1, value: "B" }],
    })).toBeNull();

    expect(applyArrayNestedReplacements({
      state,
      arraySegments: ["items"],
      array: state.items,
      suffixSegments: ["missing", "title"],
      replacements: [{ index: 0, value: "B" }],
    })).toBeNull();
  });
});

describe("replace applied operation validation", () => {
  test("accepts applied replace operation lists that satisfy local schemas", () => {
    const state = { title: "Final" };

    expect(evaluateAppliedReplaceOperations({
      schema: z.object({ title: z.string() }),
      state,
      operations: [{ op: "replace", path: "/title", value: "Final" }],
      valuesTrusted: false,
    })).toEqual({ ok: true });
  });

  test("rejects applied replace operation lists with unsupported operations", () => {
    const state = { title: "Draft", items: [] as string[] };

    expect(evaluateAppliedReplaceOperations({
      schema: z.object({ title: z.string(), items: z.array(z.string()) }),
      state,
      operations: [{ op: "add", path: "/items/0", value: "A" }],
      valuesTrusted: false,
    })).toEqual({ ok: false, result: null });
  });

  test("returns validation failures for applied replace values", () => {
    const state = { title: "Draft" };
    const result = evaluateAppliedReplaceOperations({
      schema: z.object({ title: z.string() }),
      state,
      operations: [{ op: "replace", path: "/title", value: 1 }],
      valuesTrusted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });

  test("accepts replace values when known-json validation accepts them", () => {
    const state = { items: [{ name: "old" }] };
    const operations = [{ op: "replace" as const, path: "/items/0/name", value: "A", index: 0 }];

    expect(evaluateAppliedReplaceValueValidationPlan(
      state,
      operations,
      z.never(),
      () => true,
      false,
    )).toBeNull();
  });

  test("strips planner-only metadata from applied replace operations", () => {
    const operations = [
      { op: "replace" as const, path: "/items/0/name", value: "A", index: 0 },
      { op: "replace" as const, path: "/items/1/name", value: "B", field: "name" },
    ];

    expect(toAppliedReplaceOperations(operations)).toEqual([
      { op: "replace", path: "/items/0/name", value: "A" },
      { op: "replace", path: "/items/1/name", value: "B" },
    ]);
  });

  test("rejects untrusted non-serializable replace values before schema parsing", () => {
    const state = { items: [{ name: "old" }] };

    const result = evaluateAppliedReplaceValueValidationPlan(
      state,
      [{ op: "replace", path: "/items/0/name", value: () => "not json" }],
      z.unknown(),
      () => false,
      false,
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
  });
});

describe("remove applied operation normalization", () => {
  test("strips planner-only metadata from applied remove operations", () => {
    const operations = [
      { op: "remove" as const, path: "/items/0", index: 0 },
      { op: "remove" as const, path: "/items/1", key: "ignored" },
    ];

    expect(toAppliedRemoveOperations(operations)).toEqual([
      { op: "remove", path: "/items/0" },
      { op: "remove", path: "/items/1" },
    ]);
  });
});

describe("local patch result helpers", () => {
  test("wraps successful patch results with applied operations", () => {
    const state = { title: "Final" };
    const applied = [{ op: "replace" as const, path: "/title", value: "Final" }];

    expect(okLocalPatch(state, applied)).toEqual({
      state,
      result: { ok: true },
      applied,
    });
  });

  test("wraps failed patch results with no applied operations", () => {
    const state = { title: "Draft" };

    expect(failedLocalPatch(state, {
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    })).toEqual({
      state,
      result: {
        ok: false,
        code: "path_not_found",
        pointer: "/missing",
      },
      applied: [],
    });
  });
});

describe("local patch value validation evaluation", () => {
  test("accepts plans that need no runtime validation", () => {
    expect(evaluateLocalPatchValueValidationPlan(
      { title: "Draft" },
      { kind: "accepted" },
    )).toBeNull();
  });

  test("converts non-serializable plans to local patch failures", () => {
    const state = { value: "Draft" };
    const result = evaluateLocalPatchValueValidationPlan(state, {
      kind: "notSerializable",
      reason: "function is not JSON-serializable",
    });

    expect(result).toEqual({
      state,
      result: {
        ok: false,
        code: "not_serializable",
        reason: "function is not JSON-serializable",
      },
      applied: [],
    });
  });

  test("converts parse plans to prefixed schema violations", () => {
    const state = { title: "Draft" };
    const result = evaluateLocalPatchValueValidationPlan(state, {
      kind: "parse",
      path: "/title",
      schema: z.string(),
      value: 1,
    });

    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected validation failure");
    expect(result.state).toBe(state);
    expect(result.applied).toEqual([]);
    expect(result.result).toMatchObject({ ok: false, code: "schema_violation" });
    expect(result.result.ok).toBe(false);
    if (result.result.ok) throw new Error("expected schema violation");
    const issues = JSON.parse(result.result.reason ?? "[]");
    expect(issues[0].path).toEqual(["title"]);
  });
});

describe("known-json value validation", () => {
  test("accepts primitive schemas only for JSON-compatible values", () => {
    expect(acceptsKnownJsonValue(z.string(), "A")).toBe(true);
    expect(acceptsKnownJsonValue(z.number(), 1)).toBe(true);
    expect(acceptsKnownJsonValue(z.number(), Number.NaN)).toBe(false);
    expect(acceptsKnownJsonValue(z.boolean(), false)).toBe(true);
    expect(acceptsKnownJsonValue(z.null(), null)).toBe(true);
    expect(acceptsKnownJsonValue(z.literal("draft"), "draft")).toBe(true);
    expect(acceptsKnownJsonValue(z.enum(["todo", "done"]), "done")).toBe(true);
  });

  test("accepts plain object, array, and record values without schema parsing", () => {
    expect(acceptsKnownJsonValue(
      z.object({ name: z.string(), done: z.boolean().optional() }),
      { name: "A" },
    )).toBe(true);

    expect(acceptsKnownJsonValue(z.array(z.number()), [1, 2])).toBe(true);

    const record: Record<string, unknown> = {};
    writeObjectDataValue(record, "__proto__", "data");
    expect(acceptsKnownJsonValue(z.record(z.string(), z.string()), record)).toBe(true);
  });

  test("rejects values that need schema parsing or are not plain JSON data", () => {
    expect(acceptsKnownJsonValue(z.string().min(1), "A")).toBe(false);
    expect(acceptsKnownJsonValue(z.coerce.number(), 1)).toBe(false);
    expect(acceptsKnownJsonValue(z.unknown(), "A")).toBe(false);
    expect(acceptsKnownJsonValue(z.object({ name: z.string() }), { name: "A", extra: 1 })).toBe(false);

    const withGetter = {};
    Object.defineProperty(withGetter, "name", {
      get: () => "A",
      enumerable: true,
    });
    expect(acceptsKnownJsonValue(z.object({ name: z.string() }), withGetter)).toBe(false);

    const sparse = new Array<number>(2);
    sparse[1] = 1;
    expect(acceptsKnownJsonValue(z.array(z.number()), sparse)).toBe(false);

    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(acceptsKnownJsonValue(z.array(z.unknown()), cyclic)).toBe(false);
  });
});

describe("schema issue prefixing", () => {
  test("prefixes issue paths with decoded pointer segments", () => {
    const issues: z.ZodError["issues"] = [
      { code: "custom", message: "invalid", path: ["name"] },
    ];

    expect(prefixIssues("/items/0", issues)).toEqual([
      { code: "custom", message: "invalid", path: ["items", 0, "name"] },
    ]);

    expect(prefixIssues("/a~1b/0", issues)).toEqual([
      { code: "custom", message: "invalid", path: ["a/b", 0, "name"] },
    ]);
  });

  test("keeps root prefixes empty and preserves non-canonical numeric text", () => {
    const issues: z.ZodError["issues"] = [
      { code: "custom", message: "invalid", path: [] },
    ];

    expect(prefixIssues("", issues)).toEqual(issues);
    expect(prefixIssues("/items/01", issues)).toEqual([
      { code: "custom", message: "invalid", path: ["items", "01"] },
    ]);
    expect(issues[0]?.path).toEqual([]);
  });
});

describe("numeric path helpers", () => {
  test("parses canonical numeric pointer segments", () => {
    expect(numericSegment("0")).toBe(0);
    expect(numericSegment("1")).toBe(1);
    expect(numericSegment("42")).toBe(42);
  });

  test("rejects empty, signed, decimal, and leading-zero segments", () => {
    expect(numericSegment("")).toBeNull();
    expect(numericSegment("-")).toBeNull();
    expect(numericSegment("-1")).toBeNull();
    expect(numericSegment("1.5")).toBeNull();
    expect(numericSegment("01")).toBeNull();
    expect(numericSegment("00")).toBeNull();
    expect(numericSegment("1a")).toBeNull();
  });

  test("appends numeric indexes to root and nested array parents", () => {
    expect(appendArrayIndexPath("", 0)).toBe("/0");
    expect(appendArrayIndexPath("/items", 2)).toBe("/items/2");
    expect(appendArrayIndexPath("/a~1b", 3)).toBe("/a~1b/3");
  });
});

describe("root record copy and write helpers", () => {
  test("copies root record key prefixes with structural data keys", () => {
    const source: Record<string, unknown> = { alpha: 1, beta: 2 };
    Object.defineProperty(source, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const keys = Object.keys(source);

    expect(copyRootRecordKeyPrefix(source, keys, 2)).toEqual({ alpha: 1, beta: 2 });

    const copied = copyRootRecordKeyPrefix(source, keys, keys.length);
    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(copied, "__proto__")).toBe(true);
    expect(copied.__proto__).toEqual({ safe: true });
  });

  test("writes __proto__ as an own data key without changing the prototype", () => {
    const target: Record<string, unknown> = {};

    writeRootRecordValue(target, "alpha", 1);
    writeRootRecordValue(target, "__proto__", { safe: false });

    expect(target.alpha).toBe(1);
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(target, "__proto__")).toBe(true);
    expect(target.__proto__).toEqual({ safe: false });
  });

  test("writes object data keys for non-root replacement helpers", () => {
    const target: Record<string, unknown> = {};

    writeObjectDataValue(target, "name", "Final");
    writeObjectDataValue(target, "__proto__", { safe: "data" });

    expect(target.name).toBe("Final");
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(target, "__proto__")).toBe(true);
    expect(target.__proto__).toEqual({ safe: "data" });
  });

  test("replaces object data keys without mutating the source", () => {
    const source: Record<string, unknown> = { name: "Draft" };
    Object.defineProperty(source, "__proto__", {
      value: { label: "old" },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const next = replaceObjectDataValue(source, "__proto__", { label: "new" });

    expect(next?.name).toBe("Draft");
    expect(next).not.toBe(source);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(next as object, "__proto__")).toBe(true);
    expect(next?.__proto__).toEqual({ label: "new" });
    expect(source.__proto__).toEqual({ label: "old" });
  });

  test("rejects missing and non-object data replacements", () => {
    expect(replaceObjectDataValue({ name: "Draft" }, "missing", "Final")).toBeNull();
    expect(replaceObjectDataValue(["Draft"], "0", "Final")).toBeNull();
    expect(replaceObjectDataValue(null, "name", "Final")).toBeNull();
  });

  test("creates null-prototype key sets for structural data keys", () => {
    const keySet = createDataKeySet(["alpha", "__proto__"]);

    expect(Object.getPrototypeOf(keySet)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(keySet, "alpha")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(keySet, "__proto__")).toBe(true);
    expect(keySet.__proto__).toBe(true);
  });
});

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

  test("keeps single replace JSON guard before schema parsing", () => {
    const state = { title: "Draft" };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ title: z.unknown() }),
      state,
      [{ op: "replace", path: "/title", value: () => "not json" }],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
  });

  test("returns single replace schema violations through applied replace validation", () => {
    const state = { title: "Draft" };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ title: z.string() }),
      state,
      [{ op: "replace", path: "/title", value: 1 }],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
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

  test("evaluates known-json replace values through local schemas", () => {
    const schema = z.object({
      title: z.string(),
      meta: z.object({ owner: z.string() }),
    });

    expect(evaluateKnownJsonReplaceValues({
      schema,
      operations: [
        { op: "replace", path: "/title", value: "Final" },
        { op: "replace", path: "/meta/owner", value: "core" },
      ],
    })).toBe(true);

    expect(evaluateKnownJsonReplaceValues({
      schema,
      operations: [{ op: "replace", path: "/missing", value: "Final" }],
    })).toBe(false);

    expect(evaluateKnownJsonReplaceValues({
      schema,
      operations: [{ op: "replace", path: "/title", value: 1 }],
    })).toBe(false);
  });
});

describe("sequential patch planning", () => {
  test("plans supported local operation candidates in order", () => {
    const operations: JSONPatchOperation[] = [
      { op: "add", path: "/items/0", value: "A" },
      { op: "replace", path: "/title", value: "Final" },
      { op: "copy", from: "/items/0", path: "/items/1" },
      { op: "move", from: "/items/1", path: "/items/0" },
      { op: "remove", path: "/items/0" },
    ];

    expect(planSequentialPatch({ operations })).toEqual({ operations });
  });

  test("rejects unsupported or malformed sequential candidates", () => {
    expect(planSequentialPatch({ operations: [] })).toBeNull();

    expect(planSequentialPatch({
      operations: [{ op: "test", path: "/title", value: "Draft" }],
    })).toBeNull();

    expect(planSequentialPatch({
      operations: [{ op: "add", path: "/title" } as JSONPatchOperation],
    })).toBeNull();

    expect(planSequentialPatch({
      operations: [{ op: "copy", path: "/title" } as JSONPatchOperation],
    })).toBeNull();

    expect(planSequentialPatch({
      operations: [{ op: "replace", path: 1, value: "Final" } as unknown as JSONPatchOperation],
    })).toBeNull();

    const sparse = new Array<JSONPatchOperation>(2);
    sparse[1] = { op: "replace", path: "/title", value: "Final" };
    expect(planSequentialPatch({ operations: sparse })).toBeNull();
  });

  test("keeps mixed sequential fallback applied operations in order", () => {
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ title: z.string(), items: z.array(z.string()) }),
      { title: "Draft", items: [] },
      [
        { op: "add", path: "/items/0", value: "A" },
        { op: "replace", path: "/title", value: "Final" },
      ],
    );

    expect(result?.state).toEqual({ title: "Final", items: ["A"] });
    expect(result?.applied).toEqual([
      { op: "add", path: "/items/0", value: "A" },
      { op: "replace", path: "/title", value: "Final" },
    ]);
  });
});

describe("sequential local operation application", () => {
  const schema = z.object({
    title: z.string(),
    items: z.array(z.string()),
  });

  test("applies one operation and returns the applied operation", () => {
    const state = { title: "Draft", items: [] as string[] };

    expect(applySequentialLocalOperation({
      schema,
      state,
      current: state,
      operation: { op: "add", path: "/items/0", value: "A" },
      valuesTrusted: false,
    })).toEqual({
      ok: true,
      state: { title: "Draft", items: ["A"] },
      applied: { op: "add", path: "/items/0", value: "A" },
    });
  });

  test("returns patch failures against the original state", () => {
    const state = { title: "Draft", items: [] as string[] };
    const result = applySequentialLocalOperation({
      schema,
      state,
      current: state,
      operation: { op: "remove", path: "/items/0" },
      valuesTrusted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected patch failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false },
      applied: [],
    });
  });

  test("returns schema validation failures after successful patch application", () => {
    const state = { title: "Draft", items: [] as string[] };
    const result = applySequentialLocalOperation({
      schema,
      state,
      current: state,
      operation: { op: "add", path: "/items/0", value: 1 },
      valuesTrusted: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });
});

describe("applied local op source value reading", () => {
  test("reads source values for copy and move operations", () => {
    const state = {
      items: ["A", "B"],
      "a/b": ["escaped"],
    };

    expect(readAppliedLocalOpSourceValue({
      state,
      operation: { op: "copy", from: "/items/0", path: "/items/1" },
    })).toEqual({ ok: true, value: "A" });

    expect(readAppliedLocalOpSourceValue({
      state,
      operation: { op: "move", from: "/a~1b/0", path: "/items/0" },
    })).toEqual({ ok: true, value: "escaped" });
  });

  test("returns no source value for non-source and unreadable operations", () => {
    const state = { items: ["A"] };

    expect(readAppliedLocalOpSourceValue({
      state,
      operation: { op: "replace", path: "/items/0", value: "B" },
    })).toEqual({ ok: false });

    expect(readAppliedLocalOpSourceValue({
      state,
      operation: { op: "copy", from: "/missing/0", path: "/items/1" },
    })).toEqual({ ok: false });

    expect(readAppliedLocalOpSourceValue({
      state,
      operation: { op: "move", from: "items/0", path: "/items/1" },
    })).toEqual({ ok: false });
  });
});

describe("replace value at segments", () => {
  test("replaces the root when no segments remain", () => {
    expect(replaceValueAtSegments({ title: "Draft" }, [], 0, { title: "Final" }))
      .toEqual({ title: "Final" });
  });

  test("replaces nested array values with structural sharing", () => {
    const untouched = { name: "B" };
    const sibling = { keep: true };
    const state = {
      items: [{ name: "A" }, untouched],
      sibling,
    };

    const next = replaceValueAtSegments(state, ["items", "0", "name"], 0, "Final") as typeof state;

    expect(next).toEqual({
      items: [{ name: "Final" }, { name: "B" }],
      sibling: { keep: true },
    });
    expect(next).not.toBe(state);
    expect(next.items).not.toBe(state.items);
    expect(next.items[0]).not.toBe(state.items[0]);
    expect(next.items[1]).toBe(untouched);
    expect(next.sibling).toBe(sibling);
    expect(state.items[0]?.name).toBe("A");
  });

  test("returns null for missing or non-container paths", () => {
    expect(replaceValueAtSegments({ items: ["A"] }, ["items", "1"], 0, "B")).toBeNull();
    expect(replaceValueAtSegments({ title: "Draft" }, ["title", "text"], 0, "Final")).toBeNull();
    expect(replaceValueAtSegments({ items: ["A"] }, ["items", "01"], 0, "B")).toBeNull();
  });

  test("keeps __proto__ as an own data key", () => {
    const state: Record<string, unknown> = {};
    Object.defineProperty(state, "__proto__", {
      value: { label: "old" },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const next = replaceValueAtSegments(state, ["__proto__", "label"], 0, "new") as Record<string, unknown>;

    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(next, "__proto__")).toBe(true);
    expect(next.__proto__).toEqual({ label: "new" });
  });
});

describe("array element schema lookup", () => {
  test("finds element schemas from array parent pointers", () => {
    const item = z.object({ name: z.string() });
    const escapedItem = z.number();
    const schema = z.object({
      items: z.array(item),
      "a/b": z.array(escapedItem),
      title: z.string(),
    });

    expect(arrayElementSchemaAtParent(schema, "/items")).toBe(item);
    expect(arrayElementSchemaAtParent(schema, "/a~1b")).toBe(escapedItem);
    expect(arrayElementSchemaAtParent(schema, "/title")).toBeNull();
    expect(arrayElementSchemaAtParent(schema, "/missing")).toBeNull();
  });

  test("finds element schemas for root, nested, append, and escaped array paths", () => {
    const rootItem = z.string();
    expect(arrayElementSchemaAtPath(z.array(rootItem), "/0")).toBe(rootItem);

    const item = z.object({ name: z.string() });
    const escapedItem = z.number();
    const schema = z.object({
      items: z.array(item),
      "a/b": z.array(escapedItem),
    });

    expect(arrayElementSchemaAtPath(schema, "/items/0")).toBe(item);
    expect(arrayElementSchemaAtPath(schema, "/items/-")).toBe(item);
    expect(arrayElementSchemaAtPath(schema, "/a~1b/0")).toBe(escapedItem);
  });

  test("rejects paths that do not name an array element position", () => {
    const schema = z.object({
      title: z.string(),
      items: z.array(z.object({ name: z.string() })),
    });

    expect(arrayElementSchemaAtPath(schema, "")).toBeNull();
    expect(arrayElementSchemaAtPath(schema, "/title")).toBeNull();
    expect(arrayElementSchemaAtPath(schema, "/items/name")).toBeNull();
    expect(arrayElementSchemaAtPath(schema, "/items/01")).toBeNull();
    expect(arrayElementSchemaAtPath(schema, "/items/0/name")).toBeNull();
  });
});

describe("array index path parsing", () => {
  test("parses array index paths with parent segments", () => {
    expect(arrayIndexPathLocation("/0")).toEqual({
      parent: "",
      parentSegments: [],
      index: 0,
    });

    expect(arrayIndexPathLocation("/items/2")).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      index: 2,
    });

    expect(arrayIndexPathLocation("/items/-")).toEqual({
      parent: "/items",
      parentSegments: ["items"],
      index: "-",
    });

    expect(arrayIndexPathLocation("/a~1b/0")).toEqual({
      parent: "/a~1b",
      parentSegments: ["a/b"],
      index: 0,
    });
  });

  test("rejects non-array-index paths", () => {
    expect(arrayIndexPathLocation("items/0")).toBeNull();
    expect(arrayIndexPathLocation("")).toBeNull();
    expect(arrayIndexPathLocation("/items/name")).toBeNull();
    expect(arrayIndexPathLocation("/items/01")).toBeNull();
    expect(arrayIndexPathLocation("/items/0/name")).toBeNull();
  });

  test("parses indexes only inside the requested parent", () => {
    expect(arrayIndexInParent("/items/0", "/items")).toEqual({ index: 0 });
    expect(arrayIndexInParent("/items/-", "/items")).toEqual({ index: "-" });
    expect(arrayIndexInParent("/a~1b/3", "/a~1b")).toEqual({ index: 3 });
    expect(arrayIndexInParent("/other/0", "/items")).toBeNull();
    expect(arrayIndexInParent("/items/0/name", "/items")).toBeNull();
    expect(arrayIndexInParent("/items/01", "/items")).toBeNull();
  });
});

describe("applied local op validation planning", () => {
  const schema = z.object({
    title: z.string(),
    items: z.array(z.string()),
  });

  test("plans parse validation for replace and add operations", () => {
    const replace = planAppliedLocalOpValidation({
      schema,
      operation: { op: "replace", path: "/title", value: "Final" },
      sourceValue: { ok: false },
    });

    expect(replace).toMatchObject({ kind: "parse", path: "/title", value: "Final" });
    expect(replace?.kind === "parse" && replace.schema.safeParse(replace.value).success).toBe(true);

    const add = planAppliedLocalOpValidation({
      schema,
      operation: { op: "add", path: "/items/0", value: "A" },
      sourceValue: { ok: false },
    });

    expect(add).toMatchObject({ kind: "parse", path: "/items/0", value: "A" });
    expect(add?.kind === "parse" && add.schema.safeParse(add.value).success).toBe(true);
  });

  test("plans source-value validation for copy and move operations", () => {
    const copy = planAppliedLocalOpValidation({
      schema,
      operation: { op: "copy", from: "/items/0", path: "/items/1" },
      sourceValue: { ok: true, value: "A" },
    });

    expect(copy).toMatchObject({ kind: "parse", path: "/items/1", value: "A" });

    const move = planAppliedLocalOpValidation({
      schema,
      operation: { op: "move", from: "/items/0", path: "/items/1" },
      sourceValue: { ok: true, value: "B" },
    });

    expect(move).toMatchObject({ kind: "parse", path: "/items/1", value: "B" });
  });

  test("plans presence validation for remove operations", () => {
    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "remove", path: "/items/0" },
      sourceValue: { ok: false },
    })).toEqual({ kind: "presence" });
  });

  test("rejects applied operations without a local schema validation target", () => {
    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "replace", path: "", value: { title: "root" } },
      sourceValue: { ok: false },
    })).toBeNull();

    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "add", path: "/title", value: "A" },
      sourceValue: { ok: false },
    })).toBeNull();

    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "copy", from: "/items/0", path: "/items/1" },
      sourceValue: { ok: false },
    })).toBeNull();

    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "move", from: "/missing/0", path: "/items/1" },
      sourceValue: { ok: true, value: "A" },
    })).toBeNull();

    expect(planAppliedLocalOpValidation({
      schema,
      operation: { op: "test", path: "/title", value: "Draft" },
      sourceValue: { ok: false },
    })).toBeNull();
  });
});

describe("applied local op validation evaluation", () => {
  test("accepts presence plans without parsing values", () => {
    const state = { items: ["B"] };
    const op = { op: "remove", path: "/items/0" } as const;

    expect(evaluateAppliedLocalOpValidationPlan(state, op, { kind: "presence" })).toEqual({
      state,
      result: { ok: true },
      applied: [op],
    });
  });

  test("accepts parse plans that satisfy the local schema", () => {
    const state = { title: "Final" };
    const op = { op: "replace", path: "/title", value: "Final" } as const;

    expect(evaluateAppliedLocalOpValidationPlan(state, op, {
      kind: "parse",
      path: "/title",
      schema: z.string(),
      value: "Final",
    })).toEqual({
      state,
      result: { ok: true },
      applied: [op],
    });
  });

  test("converts parse failures to prefixed schema violations", () => {
    const state = { title: 1 };
    const op = { op: "replace", path: "/title", value: 1 } as const;
    const result = evaluateAppliedLocalOpValidationPlan(state, op, {
      kind: "parse",
      path: "/title",
      schema: z.string(),
      value: 1,
    });

    expect(result.state).toBe(state);
    expect(result.applied).toEqual([]);
    expect(result.result).toMatchObject({ ok: false, code: "schema_violation" });
    expect(result.result.ok).toBe(false);
    if (result.result.ok) throw new Error("expected schema violation");
    const issues = JSON.parse(result.result.reason ?? "[]");
    expect(issues[0].path).toEqual(["title"]);
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

  test("keeps append-only array add JSON guard before schema parsing", () => {
    const state = { items: [] as unknown[] };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.unknown()) }),
      state,
      [
        { op: "add", path: "/items/-", value: () => "not json" },
        { op: "add", path: "/items/-", value: 2 },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("keeps increasing array add JSON guard before schema parsing", () => {
    const state = { items: [] as unknown[] };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.unknown()) }),
      state,
      [
        { op: "add", path: "/items/0", value: () => "not json" },
        { op: "add", path: "/items/1", value: 2 },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("keeps same-array structural add JSON guard before schema parsing", () => {
    const state = { items: ["old"] as unknown[] };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.unknown()) }),
      state,
      [
        { op: "remove", path: "/items/0" },
        { op: "add", path: "/items/0", value: () => "not json" },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("validates root record add values through record schemas", () => {
    const state = {};

    expect(evaluateRootRecordAddValues({
      schema: z.record(z.string(), z.number()),
      state,
      operations: [{ op: "add", path: "/alpha", key: "alpha", value: 1 }],
      valuesTrusted: false,
    })).toEqual({ ok: true });

    expect(evaluateRootRecordAddValues({
      schema: z.object({ alpha: z.number() }),
      state: { alpha: 0 },
      operations: [{ op: "add", path: "/alpha", key: "alpha", value: 1 }],
      valuesTrusted: false,
    })).toEqual({ ok: false, result: null });
  });

  test("finds local root record value schemas only for plain string-key records", () => {
    const valueSchema = rootRecordValueSchemaForLocalPatch(z.record(z.string(), z.number()));

    expect(valueSchema?.safeParse(1).success).toBe(true);
    expect(valueSchema?.safeParse("bad").success).toBe(false);
    expect(rootRecordValueSchemaForLocalPatch(z.object({ alpha: z.number() }))).toBeNull();
    expect(rootRecordValueSchemaForLocalPatch(z.record(z.string().min(1), z.number()))).toBeNull();
  });

  test("returns root record add value validation failures", () => {
    const state = {};
    const result = evaluateRootRecordAddValues({
      schema: z.record(z.string(), z.number()),
      state,
      operations: [{ op: "add", path: "/alpha", key: "alpha", value: "bad" }],
      valuesTrusted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });

  test("applies planned root record adds without mutating the source", () => {
    const source = { alpha: 1, beta: 2 };

    const result = applyRootRecordAddPlan({
      source,
      plan: {
        operations: [
          { op: "add", path: "/beta", key: "beta", value: 20 },
          { op: "add", path: "/gamma", key: "gamma", value: 3 },
        ],
      },
    });

    expect(result).toEqual({ alpha: 1, beta: 20, gamma: 3 });
    expect(result).not.toBe(source);
    expect(source).toEqual({ alpha: 1, beta: 2 });
  });

  test("keeps __proto__ as a data key when applying root record adds", () => {
    const source: Record<string, unknown> = { alpha: 1 };

    const result = applyRootRecordAddPlan({
      source,
      plan: {
        operations: [
          { op: "add", path: "/__proto__", key: "__proto__", value: { safe: true } },
        ],
      },
    });

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(true);
    expect(result.__proto__).toEqual({ safe: true });
    expect(Object.prototype.hasOwnProperty.call(source, "__proto__")).toBe(false);
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

  test("applies planned root record remove strategies to data records", () => {
    const source = { a: 1, b: 2, c: 3, d: 4 };

    expect(applyRootRecordRemovePlan({
      source,
      sourceKeys: ["a", "b", "c", "d"],
      plan: {
        operations: [
          { op: "remove", path: "/b", key: "b" },
          { op: "remove", path: "/d", key: "d" },
        ],
        strategy: "copyDelete",
        keepCount: 2,
      },
    })).toEqual({ a: 1, c: 3 });

    expect(applyRootRecordRemovePlan({
      source,
      sourceKeys: ["a", "b", "c", "d"],
      plan: {
        operations: [
          { op: "remove", path: "/c", key: "c" },
          { op: "remove", path: "/d", key: "d" },
        ],
        strategy: "copyPrefix",
        keepCount: 2,
      },
    })).toEqual({ a: 1, b: 2 });

    expect(applyRootRecordRemovePlan({
      source,
      sourceKeys: ["a", "b", "c", "d"],
      plan: {
        operations: [
          { op: "remove", path: "/a", key: "a" },
          { op: "remove", path: "/c", key: "c" },
        ],
        strategy: "rebuild",
        keepCount: 2,
      },
    })).toEqual({ b: 2, d: 4 });

    expect(applyRootRecordRemovePlan({
      source,
      sourceKeys: ["a", "b", "c", "d"],
      plan: {
        operations: [
          { op: "remove", path: "/a", key: "a" },
          { op: "remove", path: "/b", key: "b" },
          { op: "remove", path: "/c", key: "c" },
          { op: "remove", path: "/d", key: "d" },
        ],
        strategy: "clear",
        keepCount: 0,
      },
    })).toEqual({});
  });

  test("keeps __proto__ as data through rebuild remove strategy", () => {
    const state: Record<string, unknown> = { a: 1 };
    Object.defineProperty(state, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    state.b = 2;
    state.c = 3;

    const result = applyPatchWithLocalSchemaValidation(
      z.record(z.string(), z.unknown()),
      state,
      [
        { op: "remove", path: "/a" },
        { op: "remove", path: "/b" },
      ],
    );

    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected local root record remove result");
    expect(result.state).toMatchObject({ c: 3 });
    expect(Object.getPrototypeOf(result.state)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result.state as object, "__proto__")).toBe(true);
    expect((result.state as Record<string, unknown>).__proto__).toEqual({ safe: true });
    expect(result.applied).toEqual([
      { op: "remove", path: "/a" },
      { op: "remove", path: "/b" },
    ]);
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

  test("keeps root record add JSON guard before schema parsing", () => {
    const state = {};
    const result = applyPatchWithLocalSchemaValidation(
      z.record(z.string(), z.unknown()),
      state,
      [
        { op: "add", path: "/alpha", value: () => "not json" },
        { op: "add", path: "/beta", value: 2 },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("validates root object replacement values through object shape schemas", () => {
    const state = { a: 0, b: 0 };

    expect(evaluateRootObjectReplaceValues({
      state,
      operations: [
        { op: "replace", path: "/a", key: "a", value: 1 },
        { op: "replace", path: "/b", key: "b", value: 2 },
      ],
      source: { kind: "object", shape: { a: z.number(), b: z.number() } },
      valuesTrusted: false,
    })).toEqual({ ok: true });

    expect(evaluateRootObjectReplaceValues({
      state,
      operations: [{ op: "replace", path: "/missing", key: "missing", value: 1 }],
      source: { kind: "object", shape: { a: z.number() } },
      valuesTrusted: false,
    })).toEqual({ ok: false, result: null });
  });

  test("validates root record replacement values through one record value schema", () => {
    const state = { a: 0 };
    const result = evaluateRootObjectReplaceValues({
      state,
      operations: [{ op: "replace", path: "/a", key: "a", value: "bad" }],
      source: {
        kind: "record",
        schema: z.number(),
        acceptsKnownJson: () => false,
      },
      valuesTrusted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.result).toMatchObject({
      state,
      result: { ok: false, code: "schema_violation" },
      applied: [],
    });
  });

  test("applies planned root object replace strategies to data records", () => {
    const source = { a: 0, b: 0, c: 0 };

    expect(applyRootObjectReplacePlan({
      source,
      sourceKeys: ["a", "b", "c"],
      plan: {
        operations: [
          { op: "replace", path: "/a", key: "a", value: 1 },
          { op: "replace", path: "/b", key: "b", value: 2 },
          { op: "replace", path: "/c", key: "c", value: 3 },
        ],
        strategy: "orderedReplace",
      },
    })).toEqual({ a: 1, b: 2, c: 3 });

    expect(applyRootObjectReplacePlan({
      source,
      sourceKeys: ["a", "b", "c"],
      plan: {
        operations: [
          { op: "replace", path: "/b", key: "b", value: 2 },
          { op: "replace", path: "/a", key: "a", value: 1 },
        ],
        strategy: "copyWrite",
      },
    })).toEqual({ a: 1, b: 2, c: 0 });
  });

  test("keeps __proto__ as a data key when applying root object replacements", () => {
    const source: Record<string, unknown> = { a: 0 };
    Object.defineProperty(source, "__proto__", {
      value: { old: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const result = applyRootObjectReplacePlan({
      source,
      sourceKeys: Object.keys(source),
      plan: {
        operations: [{ op: "replace", path: "/__proto__", key: "__proto__", value: { safe: true } }],
        strategy: "copyWrite",
      },
    });

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(true);
    expect(result.__proto__).toEqual({ safe: true });
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

  test("keeps root object replace JSON guard before schema parsing", () => {
    const objectState = { a: 0, b: 0 };
    const objectResult = applyPatchWithLocalSchemaValidation(
      z.object({ a: z.unknown(), b: z.unknown() }),
      objectState,
      [
        { op: "replace", path: "/a", value: () => "not json" },
        { op: "replace", path: "/b", value: 2 },
      ],
    );

    expect(objectResult).toMatchObject({
      state: objectState,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });

    const recordState = { a: 0, b: 0 };
    const recordResult = applyPatchWithLocalSchemaValidation(
      z.record(z.string(), z.unknown()),
      recordState,
      [
        { op: "replace", path: "/a", value: () => "not json" },
        { op: "replace", path: "/b", value: 2 },
      ],
    );

    expect(recordResult).toMatchObject({
      state: recordState,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("keeps same-array field replace JSON guard before schema parsing", () => {
    const state = { items: [{ name: "old" }, { name: "old" }] };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.object({ name: z.string() })) }),
      state,
      [
        { op: "replace", path: "/items/0/name", value: () => "not json" },
        { op: "replace", path: "/items/1/name", value: "B" },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
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

  test("keeps same-array nested replace JSON guard before schema parsing", () => {
    const state = {
      items: [{ meta: { title: "old" } }, { meta: { title: "old" } }],
    };
    const result = applyPatchWithLocalSchemaValidation(
      z.object({ items: z.array(z.object({ meta: z.object({ title: z.string() }) })) }),
      state,
      [
        { op: "replace", path: "/items/0/meta/title", value: () => "not json" },
        { op: "replace", path: "/items/1/meta/title", value: "B" },
      ],
    );

    expect(result).toMatchObject({
      state,
      result: { ok: false, code: "not_serializable" },
      applied: [],
    });
  });
});
