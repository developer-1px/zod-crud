// P6 — RFC 9535 JSONPath 자체 구현 + find/replace 테스트.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { query, queryMatches } from "../src/core/jsonpath/index.js";
import { find } from "../src/verbs/find.js";
import { replace } from "../src/verbs/replace.js";

const data = {
  store: {
    book: [
      { category: "ref", price: 8.95, title: "A", authors: ["Ann"] },
      { category: "fic", price: 12.99, title: "Book", authors: ["Bob", "Bea"] },
      { category: "fic", price: 8.99, title: "C", authors: [] },
      { category: "ref", price: 22.99, title: "Delta", authors: ["Dan"] },
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

  test("RFC 9535 function extensions — length", () => {
    expect(query("$.store.book[?length(@.title) > 1]", data)).toEqual([
      "/store/book/1",
      "/store/book/3",
    ]);
  });

  test("RFC 9535 function extensions — count", () => {
    expect(query("$.store.book[?count(@.authors[*]) == 2]", data)).toEqual([
      "/store/book/1",
    ]);
  });

  test("RFC 9535 function extensions — match and search", () => {
    expect(query("$.store.book[?match(@.title, '[A-Z]')]", data)).toEqual([
      "/store/book/0",
      "/store/book/2",
    ]);
    expect(query("$.store.book[?search(@.title, 'elt')]", data)).toEqual([
      "/store/book/3",
    ]);
  });

  test("RFC 9535 function extensions — value", () => {
    expect(query("$.store.book[?value(@.authors[0]) == 'Ann']", data)).toEqual([
      "/store/book/0",
    ]);
    expect(query("$.store.book[?value(@.authors[*]) == 'Bob']", data)).toEqual([]);
  });

  test("RFC 9535 conformance edges — shorthand, numbers, strings, and Nothing", () => {
    expect(query("$.☺", { "☺": "A" })).toEqual(["/☺"]);
    expect(query("$[?@.a==-0]", [{ a: 0 }, { a: 1 }])).toEqual(["/0"]);
    expect(query('$["\\n"]', { "\n": "A" })).toEqual(["/\n"]);
    expect(query('$["\\u263A"]', { "☺": "A" })).toEqual(["/☺"]);
    expect(query("$[?@.a == length(@.b)]", [{ a: 1 }, { b: 2 }, { c: 3 }])).toEqual(["/1", "/2"]);
  });

  test("RFC 9535 conformance edges — slice and regexp semantics", () => {
    expect(query("$[::-1]", [])).toEqual([]);
    expect(query("$[113667776004:0:-1]", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      "/9",
      "/8",
      "/7",
      "/6",
      "/5",
      "/4",
      "/3",
      "/2",
      "/1",
    ]);
    expect(query("$[::-9007199254740991]", [])).toEqual([]);
    expect(query("$[?match(@, '.')]", ["\u2028"])).toEqual(["/0"]);
    expect(query("$[?match(@, '.')]", ["\r", "\n", "\u2028"])).toEqual(["/2"]);
    expect(query("$[?length(1)>=2]", [{ d: "f" }])).toEqual([]);
    expect(query("$[?@.a<=null]", [{ a: null }, { a: false }])).toEqual(["/0"]);
  });

  test("RFC 9535 conformance edges — invalid index and string forms", () => {
    expect(() => query("$[-0]", [1])).toThrow();
    expect(() => query("$[1.0]", [1, 2])).toThrow();
    expect(() => query("$[9007199254740992]", [])).toThrow();
    expect(() => query("$[\"\n\"]", { "\n": "A" })).toThrow();
    expect(() => query('$["\\\'"]', { "'": "A" })).toThrow();
  });

  test("RFC 9535 conformance edges — invalid function and whitespace forms", () => {
    expect(() => query("$[?count(1)>2]", [])).toThrow();
    expect(() => query("$[?length(@.*)<3]", [])).toThrow();
    expect(() => query("$[?match(@.a, 'a.*')==true]", [])).toThrow();
    expect(() => query("$[?value(@.a)]", [])).toThrow();
    expect(() => query("$. a", { a: 1 })).toThrow();
    expect(() => query("$[?count (@.*)==1]", [{ a: 1 }])).toThrow();
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
