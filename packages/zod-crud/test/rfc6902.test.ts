// SPEC.md G4·G5 — RFC 6901/6902 호환 정합성.

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  applyOperation,
  applyPatch,
  buildPointer,
  parsePointer,
  type JsonPatchOperation,
} from "../src/index.js";

const Any = z.any();

describe("RFC 6901 — JSON Pointer", () => {
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
  it("rolls back on mid-batch failure", () => {
    const initial = { a: 1, b: 2 };
    const ops: JsonPatchOperation[] = [
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

describe("Serializability (G1)", () => {
  it("operations and results round-trip through JSON", () => {
    const ops: JsonPatchOperation[] = [
      { op: "add", path: "/x", value: 1 },
      { op: "move", from: "/x", path: "/y" },
    ];
    expect(JSON.parse(JSON.stringify(ops))).toEqual(ops);
  });
});
