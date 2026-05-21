// RFC 6901 §6 — URI fragment 표현. JSON String 표현과 round-trip 호환.
// §6 의 4 개 예제 + edge case.

import { describe, expect, test } from "vitest";
import { buildPointer, parsePointer, tryParsePointer } from "../src/index.js";

describe("RFC 6901 §6 — URI fragment 형 Pointer", () => {
  // RFC 6901 §6 의 표준 예제 (§5 examples 가 fragment 형으로 인용됨)
  const cases: Array<{ json: string; fragment: string; segs: string[] }> = [
    { json: "",          fragment: "#",          segs: [] },
    { json: "/foo",      fragment: "#/foo",      segs: ["foo"] },
    { json: "/foo/0",    fragment: "#/foo/0",    segs: ["foo", "0"] },
    { json: "/",         fragment: "#/",         segs: [""] },
    { json: "/a~1b",     fragment: "#/a~1b",     segs: ["a/b"] },
    { json: "/c%d",      fragment: "#/c%25d",    segs: ["c%d"] },
    { json: "/e^f",      fragment: "#/e%5Ef",    segs: ["e^f"] },
    { json: "/g|h",      fragment: "#/g%7Ch",    segs: ["g|h"] },
    { json: '/i\\j',     fragment: "#/i%5Cj",    segs: ["i\\j"] },
    { json: '/k"l',      fragment: "#/k%22l",    segs: ['k"l'] },
    { json: "/ ",        fragment: "#/%20",      segs: [" "] },
    { json: "/m~0n",     fragment: "#/m~0n",     segs: ["m~n"] },
  ];

  test("parsePointer: JSON 표현 → segments", () => {
    for (const c of cases) {
      expect(parsePointer(c.json)).toEqual(c.segs);
    }
  });

  test("parsePointer: URI fragment 표현 → segments (RFC 6901 §6)", () => {
    for (const c of cases) {
      expect(parsePointer(c.fragment)).toEqual(c.segs);
    }
  });

  test("buildPointer: segments → JSON 표현", () => {
    for (const c of cases) {
      expect(buildPointer(c.segs)).toBe(c.json);
    }
  });

  test("buildPointer({ uriFragment: true }): segments → URI fragment 표현", () => {
    for (const c of cases) {
      expect(buildPointer(c.segs, { uriFragment: true })).toBe(c.fragment);
    }
  });

  test("round-trip: parse(build(segs)) === segs (양 형식)", () => {
    for (const c of cases) {
      expect(parsePointer(buildPointer(c.segs))).toEqual(c.segs);
      expect(parsePointer(buildPointer(c.segs, { uriFragment: true }))).toEqual(c.segs);
    }
  });

  test("# 단독 = 빈 fragment = root", () => {
    expect(parsePointer("#")).toEqual([]);
  });

  test("올바르지 않은 fragment 형식 거부", () => {
    expect(() => parsePointer("#foo")).toThrow();
  });

  test("잘못된 percent-encoding 은 PointerSyntaxError 로 거부", () => {
    expect(() => parsePointer("#/%E0%A4%A")).toThrow("Invalid JSON Pointer URI fragment encoding");
  });

  test("tryParsePointer 는 문법 오류를 null 로 반환", () => {
    expect(tryParsePointer("#/%E0%A4%A")).toBeNull();
    expect(tryParsePointer("foo")).toBeNull();
    expect(tryParsePointer("#/foo")).toEqual(["foo"]);
  });
});
