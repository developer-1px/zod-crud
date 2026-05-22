// SPEC.md G4·G5 — RFC 6901/6902 호환 정합성.

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  applyOperation,
  applyPatch,
  buildPointer,
  parsePointer,
  type JSONPatchOperation,
} from "../src/index.js";

const Any = z.any();

describe("RFC 6901 — JSON Pointer", () => {
  it("rejects malformed single operation input at runtime", () => {
    const initial = { x: 1 };
    const r = applyOperation(Any, initial, null as never);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("invalid_pointer");
    expect(r.state).toBe(initial);
  });

  it("parses canonical examples from RFC 6901 §5", () => {
    expect(parsePointer("")).toEqual([]);
    expect(parsePointer("/foo")).toEqual(["foo"]);
    expect(parsePointer("/foo/0")).toEqual(["foo", "0"]);
    expect(parsePointer("/")).toEqual([""]);
    expect(parsePointer("/a~1b")).toEqual(["a/b"]);
    expect(parsePointer("/m~0n")).toEqual(["m~n"]);
  });

  it("builds pointers with escapes", () => {
    expect(buildPointer([])).toBe("");
    expect(buildPointer(["foo"])).toBe("/foo");
    expect(buildPointer(["a/b"])).toBe("/a~1b");
    expect(buildPointer(["m~n"])).toBe("/m~0n");
    expect(buildPointer(["foo", 0])).toBe("/foo/0");
  });

  it("rejects invalid pointer (missing leading /)", () => {
    const r = applyOperation(Any, { x: 1 }, { op: "replace", path: "x", value: 2 });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("invalid_pointer");
  });
});

describe("RFC 6902 — add", () => {
  it("adds object property", () => {
    const r = applyOperation(Any, { foo: 1 }, { op: "add", path: "/bar", value: 2 });
    expect(r.state).toEqual({ foo: 1, bar: 2 });
  });

  it("inserts into array at index", () => {
    const r = applyOperation(Any, [1, 2, 3], { op: "add", path: "/1", value: 9 });
    expect(r.state).toEqual([1, 9, 2, 3]);
  });

  it("appends with /-", () => {
    const r = applyOperation(Any, [1, 2], { op: "add", path: "/-", value: 9 });
    expect(r.state).toEqual([1, 2, 9]);
  });

  it("replaces root with empty path", () => {
    const r = applyOperation(Any, { foo: 1 }, { op: "add", path: "", value: { bar: 2 } });
    expect(r.state).toEqual({ bar: 2 });
  });
});

describe("RFC 6902 — remove", () => {
  it("removes object key", () => {
    const r = applyOperation(Any, { a: 1, b: 2 }, { op: "remove", path: "/a" });
    expect(r.state).toEqual({ b: 2 });
  });

  it("removes array element and shifts", () => {
    const r = applyOperation(Any, [1, 2, 3], { op: "remove", path: "/1" });
    expect(r.state).toEqual([1, 3]);
  });

  it("fails on missing key", () => {
    const r = applyOperation(Any, { a: 1 }, { op: "remove", path: "/b" });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("path_not_found");
  });
});

describe("RFC 6902 — replace", () => {
  it("replaces existing value", () => {
    const r = applyOperation(Any, { a: 1 }, { op: "replace", path: "/a", value: 9 });
    expect(r.state).toEqual({ a: 9 });
  });

  it("fails when target missing", () => {
    const r = applyOperation(Any, { a: 1 }, { op: "replace", path: "/b", value: 9 });
    expect(r.result.ok).toBe(false);
  });
});

describe("RFC 6902 — move", () => {
  it("moves between paths", () => {
    const r = applyOperation(Any, { a: 1, b: 2 }, { op: "move", from: "/a", path: "/c" });
    expect(r.state).toEqual({ b: 2, c: 1 });
  });

  it("rejects move into own descendant", () => {
    const r = applyOperation(Any, { a: { b: 1 } }, { op: "move", from: "/a", path: "/a/b/c" });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("move_into_self");
  });
});

describe("RFC 6902 — copy", () => {
  it("copies value (deep clone)", () => {
    const state = { a: { x: 1 }, b: null as unknown };
    const r = applyOperation(Any, state, { op: "copy", from: "/a", path: "/b" });
    expect(r.state).toEqual({ a: { x: 1 }, b: { x: 1 } });
    expect((r.state as { a: object; b: object }).a).not.toBe((r.state as { a: object; b: object }).b);
  });
});

describe("RFC 6902 — test", () => {
  it("succeeds on deep equal", () => {
    const r = applyOperation(Any, { a: [1, 2] }, { op: "test", path: "/a", value: [1, 2] });
    expect(r.result.ok).toBe(true);
  });

  it("fails on mismatch", () => {
    const r = applyOperation(Any, { a: 1 }, { op: "test", path: "/a", value: 2 });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("test_failed");
  });
});

describe("RFC 6902 — batch atomicity (G8)", () => {
  it("rejects non-array patch input at runtime", () => {
    const initial = { a: 1 };
    const r = applyPatch(Any, initial, { op: "replace", path: "/a", value: 2 } as never);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("invalid_pointer");
    expect(r.state).toBe(initial);
  });

  it("rejects sparse patch arrays at runtime", () => {
    const initial = { a: 1 };
    const ops = [] as unknown as JSONPatchOperation[];
    ops.length = 1;
    const r = applyPatch(Any, initial, ops);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("invalid_pointer");
    expect(r.state).toBe(initial);
  });

  it("rejects malformed patch elements before applying earlier ops", () => {
    const initial = { a: 1 };
    const r = applyPatch(Any, initial, [
      { op: "replace", path: "/a", value: 2 },
      null as never,
    ]);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.code).toBe("invalid_pointer");
      expect(r.result.reason).toBe("op[1]: op must be object");
    }
    expect(r.state).toBe(initial);
  });

  it("rolls back on mid-batch failure", () => {
    const initial = { a: 1, b: 2 };
    const ops: JSONPatchOperation[] = [
      { op: "replace", path: "/a", value: 10 },
      { op: "remove", path: "/missing" },
    ];
    const r = applyPatch(Any, initial, ops);
    expect(r.result.ok).toBe(false);
    expect(r.state).toBe(initial);
  });

  it("commits when all succeed", () => {
    const r = applyPatch(Any, { a: 1, b: 2 }, [
      { op: "replace", path: "/a", value: 10 },
      { op: "test", path: "/a", value: 10 },
      { op: "remove", path: "/b" },
      { op: "add", path: "/c", value: 3 },
    ]);
    expect(r.result.ok).toBe(true);
    expect(r.state).toEqual({ a: 10, c: 3 });
  });

  it("applies independent replace batches without changing applied order or untouched references", () => {
    const first = { title: "a", done: false };
    const second = { title: "b", done: false };
    const third = { title: "c", done: false };
    const settings = { theme: "light", density: "compact" };
    const state = { items: [first, second, third], settings };
    const ops: JSONPatchOperation[] = [
      { op: "replace", path: "/items/0/done", value: true },
      { op: "replace", path: "/items/1/title", value: "B" },
      { op: "replace", path: "/settings/theme", value: "dark" },
    ];

    const r = applyPatch(Any, state, ops);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual(ops);
    expect(r.state).toEqual({
      items: [
        { title: "a", done: true },
        { title: "B", done: false },
        { title: "c", done: false },
      ],
      settings: { theme: "dark", density: "compact" },
    });
    expect(r.state.items).not.toBe(state.items);
    expect(r.state.items[0]).not.toBe(first);
    expect(r.state.items[1]).not.toBe(second);
    expect(r.state.items[2]).toBe(third);
    expect(r.state.settings).not.toBe(settings);
  });

  it("preserves ordered semantics for repeated and nested replace batches", () => {
    const repeated = applyPatch(Any, { title: "a" }, [
      { op: "replace", path: "/title", value: "b" },
      { op: "replace", path: "/title", value: "c" },
    ]);
    expect(repeated.result.ok).toBe(true);
    expect(repeated.state).toEqual({ title: "c" });

    const nested = applyPatch(Any, { item: { title: "a", done: false } }, [
      { op: "replace", path: "/item", value: { title: "b", done: true } },
      { op: "replace", path: "/item/done", value: false },
    ]);
    expect(nested.result.ok).toBe(true);
    expect(nested.state).toEqual({ item: { title: "b", done: false } });
  });

  it("keeps independent replace batches atomic when a later value is not JSON-serializable", () => {
    const initial = { items: [1, 2] };
    const r = applyPatch(Any, initial, [
      { op: "replace", path: "/items/0", value: 10 },
      { op: "replace", path: "/items/1", value: () => "bad" },
    ]);

    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });
});

describe("Schema validation (G3)", () => {
  it("rejects schema violation", () => {
    const Schema = z.object({ count: z.number() });
    const r = applyOperation(Schema, { count: 1 }, { op: "replace", path: "/count", value: "x" });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("schema_violation");
    expect(r.state).toEqual({ count: 1 });
  });
});

describe("Immutability (G2)", () => {
  it("does not mutate input state", () => {
    const state = { a: { b: [1, 2] } };
    const snapshot = JSON.parse(JSON.stringify(state));
    applyOperation(Any, state, { op: "add", path: "/a/b/-", value: 3 });
    expect(state).toEqual(snapshot);
  });
});

describe("Object safety", () => {
  it("treats __proto__ as data without mutating Object.prototype", () => {
    const r = applyOperation(Any, {}, { op: "add", path: "/__proto__", value: { polluted: true } });
    expect(r.result.ok).toBe(true);
    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(Object.prototype.hasOwnProperty.call(r.state, "__proto__")).toBe(true);
    expect((r.state as Record<string, unknown>).__proto__).toEqual({ polluted: true });
  });

  it("rejects inherited constructor traversal without mutating Object.prototype", () => {
    const r = applyOperation(Any, {}, { op: "add", path: "/constructor/prototype/polluted", value: true });
    expect(r.result.ok).toBe(false);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("keeps own constructor keys as data", () => {
    const state = { constructor: { prototype: {} } };
    const r = applyOperation(Any, state, { op: "add", path: "/constructor/prototype/polluted", value: true });
    expect(r.result.ok).toBe(true);
    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(r.state).toEqual({ constructor: { prototype: { polluted: true } } });
  });
});

describe("Serializability (G1)", () => {
  it("operations and results round-trip through JSON", () => {
    const ops: JSONPatchOperation[] = [
      { op: "add", path: "/x", value: 1 },
      { op: "move", from: "/x", path: "/y" },
    ];
    expect(JSON.parse(JSON.stringify(ops))).toEqual(ops);
  });

  it("rejects undefined values instead of silently dropping object keys", () => {
    const initial = { ok: true };
    const r = applyOperation(Any, initial, { op: "add", path: "/missing", value: undefined });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });

  it("rejects non-plain objects such as Date", () => {
    const initial = { at: null as unknown };
    const r = applyOperation(Any, initial, { op: "replace", path: "/at", value: new Date("2026-05-18T00:00:00.000Z") });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });

  it("rejects non-finite numbers", () => {
    const initial = { n: 0 };
    const r = applyOperation(Any, initial, { op: "replace", path: "/n", value: Number.NaN });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });

  it("keeps batch atomic when a later op is not JSON-serializable", () => {
    const initial = { items: [] as unknown[] };
    const r = applyPatch(Any, initial, [
      { op: "add", path: "/items/-", value: "ok" },
      { op: "add", path: "/items/-", value: () => "bad" },
    ]);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });

  it("rejects non-serializable input state before cloning can drop data", () => {
    const initial = { keep: true, lost: undefined };
    const r = applyOperation(Any, initial, { op: "add", path: "/next", value: true });
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });

  it("rejects circular input state before cloning can throw", () => {
    const initial: { self?: unknown } = {};
    initial.self = initial;
    const r = applyPatch(Any, initial, [{ op: "add", path: "/ok", value: true }]);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("not_serializable");
    expect(r.state).toBe(initial);
  });
});
