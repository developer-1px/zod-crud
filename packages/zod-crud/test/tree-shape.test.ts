import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createJsonCrud } from "../src/index.js";

const ArrayDocSchema = z.array(z.union([z.array(z.union([z.string(), z.number()])), z.string(), z.number()]));

const NestedSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(NestedSchema),
    z.record(z.string(), NestedSchema),
  ]),
) as z.ZodType<unknown>;

describe("tree-shape: wrap / unwrap", () => {
  it("wrap puts node into a single-key object", () => {
    const crud = createJsonCrud(NestedSchema, { value: "hello" });
    const root = crud.snapshot().rootId;
    const valueId = crud.find(root, "value")!;

    const result = crud.wrap(valueId, "inner");
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual({ value: { inner: "hello" } });
  });

  it("unwrap with single child replaces node with its only child", () => {
    const crud = createJsonCrud(NestedSchema, { value: { inner: "hello" } });
    const root = crud.snapshot().rootId;
    const valueId = crud.find(root, "value")!;

    const result = crud.unwrap(valueId);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual({ value: "hello" });
  });

  it("unwrap with multiple children fails (D5-A)", () => {
    const crud = createJsonCrud(NestedSchema, { value: { a: 1, b: 2 } });
    const root = crud.snapshot().rootId;
    const valueId = crud.find(root, "value")!;

    const result = crud.unwrap(valueId);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("invalid_target");
  });

  it("wrap is reversible via undo", () => {
    const crud = createJsonCrud(NestedSchema, { value: "hello" });
    const before = crud.toJson();
    const valueId = crud.find(crud.snapshot().rootId, "value")!;
    crud.wrap(valueId, "x");
    crud.undo();
    expect(crud.toJson()).toEqual(before);
  });
});

describe("tree-shape: indent / outdent", () => {
  it("indent moves node into previous sibling array", () => {
    const crud = createJsonCrud(ArrayDocSchema, [["a", "b"], "c"]);
    const root = crud.snapshot().rootId;
    const c = crud.find(root, 1)!;

    const result = crud.indent(c);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual([["a", "b", "c"]]);
  });

  it("indent on first child fails", () => {
    const crud = createJsonCrud(ArrayDocSchema, [["a"], "b"]);
    const root = crud.snapshot().rootId;
    const first = crud.find(root, 0)!;

    const result = crud.indent(first);
    expect(result.ok).toBe(false);
  });

  it("outdent promotes node to parent's sibling", () => {
    const crud = createJsonCrud(ArrayDocSchema, [["a", "b"]]);
    const root = crud.snapshot().rootId;
    const inner = crud.find(root, 0)!;
    const b = crud.find(inner, 1)!;

    const result = crud.outdent(b);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual([["a"], "b"]);
  });
});

describe("tree-shape: split / join", () => {
  it("split divides an array node into two siblings", () => {
    const crud = createJsonCrud(ArrayDocSchema, [["a", "b", "c", "d"]]);
    const root = crud.snapshot().rootId;
    const inner = crud.find(root, 0)!;

    const result = crud.split(inner, 2);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("split on non-array fails", () => {
    const crud = createJsonCrud(ArrayDocSchema, ["x"]);
    const root = crud.snapshot().rootId;
    const x = crud.find(root, 0)!;

    const result = crud.split(x, 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("invalid_target");
  });

  it("join concatenates two arrays", () => {
    const crud = createJsonCrud(ArrayDocSchema, [["a", "b"], ["c", "d"]]);
    const root = crud.snapshot().rootId;
    const a = crud.find(root, 0)!;
    const b = crud.find(root, 1)!;

    const result = crud.join(a, b);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual([["a", "b", "c", "d"]]);
  });

  it("join with different parents fails", () => {
    const crud = createJsonCrud(NestedSchema, { left: ["a"], right: ["b"] });
    const leftArr = crud.find(crud.find(crud.snapshot().rootId, "left")!, 0)!;
    const rightArr = crud.find(crud.find(crud.snapshot().rootId, "right")!, 0)!;

    const result = crud.join(leftArr, rightArr);
    expect(result.ok).toBe(false);
  });
});
