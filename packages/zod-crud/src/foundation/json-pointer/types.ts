// SPEC.md §2.3 §5.4 — Pointer 타입 추론.
// schema 타입 → 가능한 RFC 6901 Pointer 문자열 union을 제한적으로 도출한다.
// 깊이 한계: 5단. 그 이상은 string fallback.

import type { Pointer } from "./pointerCore.js";

type Prev = [never, 0, 1, 2, 3, 4, 5];

type EscapeSegment<S extends string> =
  S extends `${infer A}~${infer B}` ? `${A}~0${EscapeSegment<B>}`
  : S extends `${infer A}/${infer B}` ? `${A}~1${EscapeSegment<B>}`
  : S;

type ArrayIndex = number;

type Join<Head extends string, Tail extends string> =
  Tail extends "" ? `/${Head}` : `/${Head}${Tail}`;

export type PointerOf<T, D extends number = 5> =
  [D] extends [never] ? Pointer
  : T extends ReadonlyArray<infer U>
    ? "" | Join<`${ArrayIndex}` | "-", ""> | Join<`${ArrayIndex}`, PointerOf<U, Prev[D]>>
  : string extends keyof T
    ? "" | Join<string, ""> | Join<string, PointerOf<T[string], Prev[D]>>
  : T extends object
    ? "" | { [K in keyof T & string]: Join<EscapeSegment<K>, ""> | Join<EscapeSegment<K>, PointerOf<T[K], Prev[D]>> }[keyof T & string]
  : "";

type SegmentValue<T, S extends string> =
  T extends ReadonlyArray<infer U>
    ? S extends `${number}` ? U
    : S extends "-" ? U
    : never
  : T extends object
    ? S extends keyof T ? T[S]
    : never
  : never;

export type ValueAt<T, P extends string, D extends number = 5> =
  [D] extends [never] ? unknown
  : P extends "" ? T
  : P extends `/${infer Head}/${infer Rest}`
    ? ValueAt<SegmentValue<T, Head>, `/${Rest}`, Prev[D]>
  : P extends `/${infer Last}`
    ? SegmentValue<T, Last>
  : never;
