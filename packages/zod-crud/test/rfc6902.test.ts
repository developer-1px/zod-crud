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

  it("inserts into arrays without mutating existing elements", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const initial = { items: [first, second] };
    const inserted = { id: "x" };
    const r = applyOperation(Any, initial, { op: "add", path: "/items/1", value: inserted });

    expect(r.result.ok).toBe(true);
    expect(initial.items).toEqual([first, second]);
    expect((r.state as typeof initial).items).toEqual([first, inserted, second]);
    expect((r.state as typeof initial).items[0]).toBe(first);
    expect((r.state as typeof initial).items[2]).toBe(second);
  });

  it("appends with /-", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const appended = { id: "c" };
    const initial = [first, second];
    const r = applyOperation(Any, initial, { op: "add", path: "/-", value: appended });

    expect(r.state).toEqual([first, second, appended]);
    expect(r.state).not.toBe(initial);
    expect((r.state as typeof initial)[0]).toBe(first);
    expect((r.state as typeof initial)[1]).toBe(second);
    expect(initial).toEqual([first, second]);
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

  it("removes array elements without mutating retained elements", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const third = { id: "c" };
    const initial = { items: [first, second, third] };
    const r = applyOperation(Any, initial, { op: "remove", path: "/items/1" });

    expect(r.result.ok).toBe(true);
    expect(initial.items).toEqual([first, second, third]);
    expect((r.state as typeof initial).items).toEqual([first, third]);
    expect((r.state as typeof initial).items[0]).toBe(first);
    expect((r.state as typeof initial).items[1]).toBe(third);
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

  it("rejects non-serializable input state before applying a patch", () => {
    const initial = { a: () => "bad", b: 1 };
    const r = applyPatch(Any, initial, [{ op: "replace", path: "/b", value: 2 }]);
    expect(r.result.ok).toBe(false);
    if (!r.result.ok) {
      expect(r.result.code).toBe("not_serializable");
      expect(r.result.reason).toBe("/a: function is not JSON");
    }
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

  it("applies root object replace batches without prototype mutation", () => {
    const state: Record<string, unknown> = { a: 1, b: 2 };
    Object.defineProperty(state, "__proto__", {
      value: { safe: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const ops: JSONPatchOperation[] = [
      { op: "replace", path: "/a", value: 10 },
      { op: "replace", path: "/__proto__", value: { safe: false } },
    ];

    const r = applyPatch(Any, state, ops);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual(ops);
    expect((r.state as Record<string, unknown>).a).toBe(10);
    expect((r.state as Record<string, unknown>).b).toBe(2);
    expect(Object.prototype).not.toHaveProperty("safe");
    expect(Object.prototype.hasOwnProperty.call(r.state as object, "__proto__")).toBe(true);
    expect((r.state as Record<string, unknown>).__proto__).toEqual({ safe: false });
  });

  it("applies same-array field replace batches without changing applied order or untouched references", () => {
    const first = { title: "a", done: false };
    const second = { title: "b", done: false };
    const third = { title: "c", done: false };
    const settings = { theme: "light" };
    const state = { items: [first, second, third], settings };
    const ops: JSONPatchOperation[] = [
      { op: "replace", path: "/items/0/done", value: true },
      { op: "replace", path: "/items/1/done", value: true },
    ];

    const r = applyPatch(Any, state, ops);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual(ops);
    expect(r.state).toEqual({
      items: [
        { title: "a", done: true },
        { title: "b", done: true },
        third,
      ],
      settings,
    });
    expect(r.state.items).not.toBe(state.items);
    expect(r.state.items[0]).not.toBe(first);
    expect(r.state.items[1]).not.toBe(second);
    expect(r.state.items[2]).toBe(third);
    expect(r.state.settings).toBe(settings);

    const repeated = applyPatch(Any, { items: [{ done: false }] }, [
      { op: "replace", path: "/items/0/done", value: true },
      { op: "replace", path: "/items/0/done", value: false },
    ]);
    expect(repeated.result.ok).toBe(true);
    expect(repeated.state).toEqual({ items: [{ done: false }] });

    const unordered = applyPatch(Any, state, [
      { op: "replace", path: "/items/2/done", value: true },
      { op: "replace", path: "/items/0/done", value: true },
    ]);
    expect(unordered.result.ok).toBe(true);
    expect(unordered.applied).toEqual([
      { op: "replace", path: "/items/2/done", value: true },
      { op: "replace", path: "/items/0/done", value: true },
    ]);
    expect(unordered.state).toEqual({
      items: [
        { title: "a", done: true },
        second,
        { title: "c", done: true },
      ],
      settings,
    });
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

  it("applies same-array copy and move batches with RFC ordering", () => {
    const first = { id: "a", nested: { count: 1 } };
    const second = { id: "b", nested: { count: 2 } };
    const third = { id: "c", nested: { count: 3 } };
    const settings = { owner: "core" };
    const initial = { items: [first, second, third], settings };

    const r = applyPatch(Any, initial, [
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "remove", path: "/items/2" },
    ]);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual([
      { op: "copy", from: "/items/0", path: "/items/3" },
      { op: "move", from: "/items/3", path: "/items/1" },
      { op: "remove", path: "/items/2" },
    ]);
    expect(r.state).toEqual({
      items: [
        { id: "a", nested: { count: 1 } },
        { id: "a", nested: { count: 1 } },
        { id: "c", nested: { count: 3 } },
      ],
      settings,
    });
    expect(r.state.items).not.toBe(initial.items);
    expect(r.state.items[0]).toBe(first);
    expect(r.state.items[1]).not.toBe(first);
    expect(r.state.items[1]?.nested).not.toBe(first.nested);
    expect(r.state.items[2]).toBe(third);
    expect(r.state.settings).toBe(settings);
  });

  it("applies single same-array append and tail remove patches with sharing", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const settings = { owner: "core" };
    const initial = { items: [first, second], settings };

    const appended = applyPatch(Any, initial, [
      { op: "add", path: "/items/-", value: { id: "c" } },
    ]);
    expect(appended.result.ok).toBe(true);
    expect(appended.applied).toEqual([{ op: "add", path: "/items/2", value: { id: "c" } }]);
    expect(appended.state.items).toEqual([first, second, { id: "c" }]);
    expect(appended.state.items).not.toBe(initial.items);
    expect(appended.state.items[0]).toBe(first);
    expect(appended.state.items[1]).toBe(second);
    expect(appended.state.settings).toBe(settings);

    const removed = applyPatch(Any, initial, [
      { op: "remove", path: "/items/1" },
    ]);
    expect(removed.result.ok).toBe(true);
    expect(removed.applied).toEqual([{ op: "remove", path: "/items/1" }]);
    expect(removed.state.items).toEqual([first]);
    expect(removed.state.items).not.toBe(initial.items);
    expect(removed.state.items[0]).toBe(first);
    expect(removed.state.settings).toBe(settings);
    expect(initial.items).toEqual([first, second]);
  });

  it("applies append-only add batches with concrete applied paths", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const settings = { owner: "core" };
    const initial = { items: [first, second], settings };

    const r = applyPatch(Any, initial, [
      { op: "add", path: "/items/-", value: { id: "c" } },
      { op: "add", path: "/items/-", value: { id: "d" } },
      { op: "add", path: "/items/-", value: { id: "e" } },
    ]);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual([
      { op: "add", path: "/items/2", value: { id: "c" } },
      { op: "add", path: "/items/3", value: { id: "d" } },
      { op: "add", path: "/items/4", value: { id: "e" } },
    ]);
    expect(r.state.items).toEqual([first, second, { id: "c" }, { id: "d" }, { id: "e" }]);
    expect(r.state.items).not.toBe(initial.items);
    expect(r.state.items[0]).toBe(first);
    expect(r.state.items[1]).toBe(second);
    expect(r.state.settings).toBe(settings);
  });

  it("applies tail remove batches with sharing", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const third = { id: "c" };
    const fourth = { id: "d" };
    const settings = { owner: "core" };
    const initial = { items: [first, second, third, fourth], settings };

    const r = applyPatch(Any, initial, [
      { op: "remove", path: "/items/3" },
      { op: "remove", path: "/items/2" },
    ]);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual([
      { op: "remove", path: "/items/3" },
      { op: "remove", path: "/items/2" },
    ]);
    expect(r.state.items).toEqual([first, second]);
    expect(r.state.items).not.toBe(initial.items);
    expect(r.state.items[0]).toBe(first);
    expect(r.state.items[1]).toBe(second);
    expect(r.state.settings).toBe(settings);
    expect(initial.items).toEqual([first, second, third, fourth]);
  });

  it("applies adjacent same-array moves with remove then add semantics", () => {
    const first = { id: "a" };
    const second = { id: "b" };
    const third = { id: "c" };
    const initial = { items: [first, second, third] };

    const r = applyPatch(Any, initial, [
      { op: "move", from: "/items/1", path: "/items/0" },
      { op: "move", from: "/items/1", path: "/items/2" },
    ]);

    expect(r.result.ok).toBe(true);
    expect(r.applied).toEqual([
      { op: "move", from: "/items/1", path: "/items/0" },
      { op: "move", from: "/items/1", path: "/items/2" },
    ]);
    expect(r.state.items).toEqual([second, third, first]);
    expect(r.state.items).not.toBe(initial.items);
    expect(initial.items).toEqual([first, second, third]);
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

  it("keeps array index validation identical on independent replace batches", () => {
    const initial = { items: [{ name: "a" }, { name: "b" }] };
    const r = applyPatch(Any, initial, [
      { op: "replace", path: "/items/0/name", value: "A" },
      { op: "replace", path: "/items/01/name", value: "B" },
    ]);

    expect(r.result.ok).toBe(false);
    if (!r.result.ok) expect(r.result.code).toBe("path_not_found");
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

  it("keeps __proto__ as data in same-array copy batches", () => {
    const item: Record<string, unknown> = { id: "a" };
    Object.defineProperty(item, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const state = { items: [item, { id: "b" }] };

    const r = applyPatch(Any, state, [
      { op: "copy", from: "/items/0", path: "/items/-" },
      { op: "remove", path: "/items/1" },
    ]);

    expect(r.result.ok).toBe(true);
    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(Object.prototype.hasOwnProperty.call(r.state.items[1], "__proto__")).toBe(true);
    expect((r.state.items[1] as Record<string, unknown>).__proto__).toEqual({ polluted: true });
    expect(r.state.items[1]).not.toBe(item);
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

  it("rejects non-enumerable and accessor state properties", () => {
    const hidden = { ok: true };
    Object.defineProperty(hidden, "secret", {
      value: true,
      enumerable: false,
      configurable: true,
    });
    const hiddenResult = applyPatch(Any, hidden, [{ op: "replace", path: "/ok", value: false }]);
    expect(hiddenResult.result.ok).toBe(false);
    if (!hiddenResult.result.ok) expect(hiddenResult.result.code).toBe("not_serializable");

    const accessor: Record<string, unknown> = { ok: true };
    Object.defineProperty(accessor, "computed", {
      get: () => true,
      enumerable: true,
      configurable: true,
    });
    const accessorResult = applyPatch(Any, accessor, [{ op: "replace", path: "/ok", value: false }]);
    expect(accessorResult.result.ok).toBe(false);
    if (!accessorResult.result.ok) {
      expect(accessorResult.result.code).toBe("not_serializable");
      expect(accessorResult.result.reason).toBe("/computed: accessor property is not JSON");
    }
  });

  it("rejects symbol-keyed state properties", () => {
    const symbolKey = Symbol("secret");
    const objectState = { ok: true, [symbolKey]: true };
    const objectResult = applyPatch(Any, objectState, [{ op: "replace", path: "/ok", value: false }]);
    expect(objectResult.result.ok).toBe(false);
    if (!objectResult.result.ok) expect(objectResult.result.code).toBe("not_serializable");

    const arrayState = [1] as number[] & { [symbolKey]?: boolean };
    arrayState[symbolKey] = true;
    const arrayResult = applyPatch(Any, { items: arrayState }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(arrayResult.result.ok).toBe(false);
    if (!arrayResult.result.ok) expect(arrayResult.result.code).toBe("not_serializable");
  });

  it("rejects sparse, non-enumerable, accessor, and extra-property arrays", () => {
    const sparse = [1, 2, 3];
    delete sparse[1];
    const sparseResult = applyPatch(Any, { items: sparse }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(sparseResult.result.ok).toBe(false);
    if (!sparseResult.result.ok) expect(sparseResult.result.code).toBe("not_serializable");

    const hidden = [1];
    Object.defineProperty(hidden, "0", {
      value: 1,
      enumerable: false,
      configurable: true,
    });
    const hiddenResult = applyPatch(Any, { items: hidden }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(hiddenResult.result.ok).toBe(false);
    if (!hiddenResult.result.ok) expect(hiddenResult.result.code).toBe("not_serializable");

    const accessor = [1];
    Object.defineProperty(accessor, "0", {
      get: () => 1,
      enumerable: true,
      configurable: true,
    });
    const accessorResult = applyPatch(Any, { items: accessor }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(accessorResult.result.ok).toBe(false);
    if (!accessorResult.result.ok) expect(accessorResult.result.code).toBe("not_serializable");

    const extra = [1] as unknown[] & { extra?: boolean };
    extra.extra = true;
    const extraResult = applyPatch(Any, { items: extra }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(extraResult.result.ok).toBe(false);
    if (!extraResult.result.ok) expect(extraResult.result.code).toBe("not_serializable");

    const hiddenExtra = [1];
    Object.defineProperty(hiddenExtra, "secret", {
      value: true,
      enumerable: false,
      configurable: true,
    });
    const hiddenExtraResult = applyPatch(Any, { items: hiddenExtra }, [{ op: "replace", path: "/items/0", value: 9 }]);
    expect(hiddenExtraResult.result.ok).toBe(false);
    if (!hiddenExtraResult.result.ok) expect(hiddenExtraResult.result.code).toBe("not_serializable");
  });
});
