// SPEC §0.2 (9) — 자동 추적 정합성.

import { describe, expect, it } from "vitest";

import { trackPointer, trackPointers } from "../src/core/track.js";
import type { JsonPatchOperation } from "../src/index.js";

describe("trackPointer — add", () => {
  it("shifts later siblings on insert", () => {
    expect(trackPointer("/tasks/2", [{ op: "add", path: "/tasks/0", value: null }])).toBe("/tasks/3");
    expect(trackPointer("/tasks/0", [{ op: "add", path: "/tasks/0", value: null }])).toBe("/tasks/1");
  });

  it("does not shift earlier siblings", () => {
    expect(trackPointer("/tasks/0", [{ op: "add", path: "/tasks/2", value: null }])).toBe("/tasks/0");
  });

  it("append marker /- never shifts", () => {
    expect(trackPointer("/tasks/2", [{ op: "add", path: "/tasks/-", value: null }])).toBe("/tasks/2");
  });

  it("propagates shift to descendants", () => {
    expect(trackPointer("/tasks/2/text", [{ op: "add", path: "/tasks/0", value: null }])).toBe("/tasks/3/text");
  });
});

describe("trackPointer — remove", () => {
  it("drops the exact pointer", () => {
    expect(trackPointer("/tasks/2", [{ op: "remove", path: "/tasks/2" }])).toBeNull();
  });

  it("drops descendants", () => {
    expect(trackPointer("/tasks/2/text", [{ op: "remove", path: "/tasks/2" }])).toBeNull();
  });

  it("shifts later siblings down", () => {
    expect(trackPointer("/tasks/3", [{ op: "remove", path: "/tasks/1" }])).toBe("/tasks/2");
  });

  it("leaves earlier siblings alone", () => {
    expect(trackPointer("/tasks/0", [{ op: "remove", path: "/tasks/2" }])).toBe("/tasks/0");
  });
});

describe("trackPointer — replace", () => {
  it("keeps the exact pointer", () => {
    expect(trackPointer("/title", [{ op: "replace", path: "/title", value: "x" }])).toBe("/title");
  });

  it("drops descendants of replaced node", () => {
    expect(trackPointer("/tasks/0/text", [{ op: "replace", path: "/tasks/0", value: null }])).toBeNull();
  });
});

describe("trackPointer — move", () => {
  it("translates exact pointer", () => {
    expect(trackPointer("/a", [{ op: "move", from: "/a", path: "/b" }])).toBe("/b");
  });

  it("translates descendants", () => {
    expect(trackPointer("/a/x", [{ op: "move", from: "/a", path: "/b" }])).toBe("/b/x");
  });

  it("shifts unrelated siblings via remove + add semantics", () => {
    // /tasks/0 -> /tasks/2 within same array
    // remove /tasks/0 → /tasks/1 stays as /tasks/0
    // add /tasks/2 → already /tasks/0, no shift
    expect(trackPointer("/tasks/1", [{ op: "move", from: "/tasks/0", path: "/tasks/2" }])).toBe("/tasks/0");
  });
});

describe("trackPointer — copy", () => {
  it("shifts siblings just like add", () => {
    expect(trackPointer("/tasks/2", [{ op: "copy", from: "/template", path: "/tasks/0" }])).toBe("/tasks/3");
  });
});

describe("trackPointer — root replace cascades drop", () => {
  it("drops everything when root is replaced", () => {
    expect(trackPointer("/anything", [{ op: "replace", path: "", value: null }])).toBeNull();
    expect(trackPointer("/tasks/0/done", [{ op: "replace", path: "", value: null }])).toBeNull();
  });
});

describe("trackPointers — sequence", () => {
  it("applies multiple ops in order", () => {
    const ops: JsonPatchOperation[] = [
      { op: "add", path: "/tasks/0", value: null },
      { op: "remove", path: "/tasks/2" },
    ];
    // /tasks/2 → /tasks/3 → /tasks/2
    expect(trackPointers(["/tasks/2"], ops)).toEqual(["/tasks/2"]);
  });

  it("drops cascaded pointers", () => {
    const ops: JsonPatchOperation[] = [{ op: "remove", path: "/tasks/0" }];
    expect(trackPointers(["/tasks/0", "/tasks/0/text", "/tasks/1"], ops)).toEqual(["/tasks/0"]);
  });
});

describe("applyPatch — applied field", () => {
  it("returns the input ops on success", async () => {
    const { applyPatch } = await import("../src/index.js");
    const z = await import("zod");
    const schema = z.z.any();
    const ops: JsonPatchOperation[] = [
      { op: "add", path: "/x", value: 1 },
      { op: "replace", path: "/x", value: 2 },
    ];
    const r = applyPatch(schema, {}, ops);
    expect(r.applied).toEqual(ops);
  });

  it("returns empty applied on failure", async () => {
    const { applyPatch } = await import("../src/index.js");
    const z = await import("zod");
    const schema = z.z.any();
    const r = applyPatch(schema, {}, [{ op: "remove", path: "/missing" }]);
    expect(r.applied).toEqual([]);
  });
});
