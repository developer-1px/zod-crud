import { describe, expect, it } from "vitest";
import { serialize } from "zod-crud";
import { ROOT, getChildren } from "@p/aria-kernel";
import { jsonDocToNormalized } from "../src/jsonDocToNormalized.js";

describe("jsonDocToNormalized", () => {
  it("ROOT의 children은 doc.rootId 한 개", () => {
    const doc = serialize({ a: 1, b: 2 });
    const data = jsonDocToNormalized(doc, new Set());

    expect(getChildren(data, ROOT)).toEqual([doc.rootId]);
  });
});
