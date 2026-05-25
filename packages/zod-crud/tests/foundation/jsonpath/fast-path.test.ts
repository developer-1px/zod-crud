import { describe, expect, test } from "vitest";

import { queryMatches } from "../../../src/foundation/jsonpath/index.js";
import { parse } from "../../../src/foundation/jsonpath/parser.js";

describe("JSONPath fast paths", () => {
  test("simple ASCII paths parse to the normal query AST", () => {
    expect(parse("$.items[1].done")).toEqual({
      segments: [
        { kind: "child", selectors: [{ kind: "name", name: "items" }] },
        { kind: "child", selectors: [{ kind: "index", index: 1 }] },
        { kind: "child", selectors: [{ kind: "name", name: "done" }] },
      ],
    });
    expect(parse("$.items[*].id")).toEqual({
      segments: [
        { kind: "child", selectors: [{ kind: "name", name: "items" }] },
        { kind: "child", selectors: [{ kind: "wildcard" }] },
        { kind: "child", selectors: [{ kind: "name", name: "id" }] },
      ],
    });
  });

  test("array wildcard field queryMatches returns field matches", () => {
    const state = {
      items: [
        { id: "a", label: "A" },
        { label: "missing" },
        null,
        { id: "d", label: "D" },
      ],
    };

    expect(queryMatches("$.items[*].id", state)).toEqual([
      { pointer: "/items/0/id", value: "a" },
      { pointer: "/items/3/id", value: "d" },
    ]);
  });

  test("indexed field queryMatches returns a single field match", () => {
    const state = {
      items: [
        { done: false },
        { done: true },
      ],
    };

    expect(queryMatches("$.items[1].done", state)).toEqual([
      { pointer: "/items/1/done", value: true },
    ]);
  });

  test("literal regex filters preserve search and match behavior", () => {
    const state = {
      items: [
        { title: "Item 99" },
        { title: "Item 999" },
        { title: "plain" },
      ],
    };

    expect(queryMatches('$.items[?search(@.title, "999")]', state)).toEqual([
      { pointer: "/items/1", value: { title: "Item 999" } },
    ]);
    expect(queryMatches('$.items[?match(@.title, "Item 999")]', state)).toEqual([
      { pointer: "/items/1", value: { title: "Item 999" } },
    ]);
    expect(queryMatches('$.items[?search(@.title, ".")]', state)).toHaveLength(3);
  });
});
