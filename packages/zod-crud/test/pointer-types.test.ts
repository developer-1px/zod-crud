// SPEC.md §5.4 — internal PointerOf<T>·ValueAt<T,P> 컴파일 타임 검증.

import { describe, it, expect } from "vitest";
import type { Pointer } from "../src/index.js";
import type { PointerOf, ValueAt } from "../src/core/pointer/types.js";

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

// #52 — Record<string, V> 동적 키도 PointerOf 가 수용해야 한다 (as never 없이).
type Sheet = { cells: Record<string, string> };
type _RecordDynamic = `/cells/${string}` extends PointerOf<Sheet> ? true : false;
const _recordDyn: _RecordDynamic = true;

type Settings = { config: Record<string, { value: number }> };
type _RecordNested = `/config/${string}/value` extends PointerOf<Settings> ? true : false;
const _recordNested: _RecordNested = true;

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
    expect(_recordDyn).toBe(true);
    expect(_recordNested).toBe(true);
  });
});
