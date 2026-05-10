// P6 — RFC 9535 JSONPath 자체 구현 + find/replace 테스트.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { query, queryMatches } from "../src/core/jsonpath/index.js";
import { find } from "../src/verbs/find.js";
import { replace } from "../src/verbs/replace.js";

const data = {
  store: {
    book: [
      { category: "ref", price: 8.95, title: "A" },
      { category: "fic", price: 12.99, title: "B" },
      { category: "fic", price: 8.99, title: "C" },
      { category: "ref", price: 22.99, title: "D" },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

describe("core/jsonpath — selectors", () => {
  test("$.store.book[*].title — wildcard", () => {
    expect(query("$.store.book[*].title", data)).toEqual([
      "/store/book/0/title",
      "/store/book/1/title",
      "/store/book/2/title",
      "/store/book/3/title",
    ]);
  });

  test("$.store.book[2] — index", () => {
    expect(query("$.store.book[2]", data)).toEqual(["/store/book/2"]);
  });

  test("$.store.book[0:2] — slice", () => {
    expect(query("$.store.book[0:2]", data)).toEqual(["/store/book/0", "/store/book/1"]);
  });

  test("$..price — descendant", () => {
    expect(query("$..price", data).sort()).toEqual([
      "/store/bicycle/price",
      "/store/book/0/price",
      "/store/book/1/price",
      "/store/book/2/price",
      "/store/book/3/price",
    ].sort());
  });

  test("$.store.book[?@.category == 'fic'] — filter compare", () => {
    expect(query("$.store.book[?@.category == 'fic']", data)).toEqual([
      "/store/book/1",
      "/store/book/2",
    ]);
  });

  test("$.store.book[?@.price < 10] — filter numeric", () => {
    expect(query("$.store.book[?@.price < 10]", data)).toEqual([
      "/store/book/0",
      "/store/book/2",
    ]);
  });

  test("filter && logical", () => {
    expect(query("$.store.book[?@.category == 'fic' && @.price > 10]", data)).toEqual([
      "/store/book/1",
    ]);
  });

  test("filter exists", () => {
    expect(query("$.store.book[?@.title]", data)).toHaveLength(4);
  });
});

describe("verbs/find", () => {
  test("query → pointers", () => {
    const r = find(data, "$..price");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pointers.length).toBeGreaterThan(0);
  });

  test("syntax error 시 ok: false", () => {
    const r = find(data, "$.???invalid???");
    expect(r.ok).toBe(false);
  });
});

describe("verbs/replace", () => {
  const Schema = z.object({
    items: z.array(z.object({ name: z.string(), active: z.boolean() })),
  });
  const init = {
    items: [
      { name: "A", active: false },
      { name: "B", active: false },
      { name: "C", active: false },
    ],
  };

  test("multi-pointer replace 가 단일 patch atomic", () => {
    const r = replace(Schema, init, "$.items[*].active", true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items.every((i) => i.active === true)).toBe(true);
    expect(r.patch).toHaveLength(3);
    expect(r.pointers).toHaveLength(3);
  });

  test("매칭 0건 → empty_match", () => {
    const r = replace(Schema, init, "$.items[?@.active == true]", false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("empty_match");
  });
});
