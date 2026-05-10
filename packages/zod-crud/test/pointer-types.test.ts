// SPEC.md §5.4 — PointerOf<T>·ValueAt<T,P> 컴파일 타임 검증.

import { describe, it, expect } from "vitest";
import type { PointerOf, ValueAt, Pointer } from "../src/index.js";

type Todo = { title: string; done: boolean; tasks: { id: string; text: string }[] };

// 컴파일 타임 assertion. 잘못된 union이면 type error.
type _ValidRoot = "" extends PointerOf<Todo> ? true : false;
const _validRoot: _ValidRoot = true;

type _ValidKey = "/title" extends PointerOf<Todo> ? true : false;
const _validKey: _ValidKey = true;

type _ValidNested = "/tasks/0/text" extends PointerOf<Todo> ? true : false;
const _validNested: _ValidNested = true;

type _ValidAppend = "/tasks/-" extends PointerOf<Todo> ? true : false;
const _validAppend: _ValidAppend = true;

type _ValueAtRoot = ValueAt<Todo, "">;
const _vRoot: _ValueAtRoot = { title: "", done: false, tasks: [] };

type _ValueAtTitle = ValueAt<Todo, "/title">;
const _vTitle: _ValueAtTitle = "x";

type _ValueAtNested = ValueAt<Todo, "/tasks/0/text">;
const _vNested: _ValueAtNested = "x";

type _PointerIsString = Pointer extends string ? true : false;
const _pStr: _PointerIsString = true;

describe("PointerOf / ValueAt (compile-time)", () => {
  it("loads at runtime", () => {
    expect(_validRoot).toBe(true);
    expect(_validKey).toBe(true);
    expect(_validNested).toBe(true);
    expect(_validAppend).toBe(true);
    expect(_vRoot.title).toBe("");
    expect(_vTitle).toBe("x");
    expect(_vNested).toBe("x");
    expect(_pStr).toBe(true);
  });
});
