import { describe, expect, test } from "vitest";

import { queryMatches } from "../src/foundation/jsonpath/index.js";

describe("JSONPath fast paths", () => {
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
});
