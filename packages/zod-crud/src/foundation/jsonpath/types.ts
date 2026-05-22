// foundation/jsonpath — RFC 9535 JSONPath types.
// AST 정의. tokenizer / parser / evaluator 가 공유.

import type { Pointer } from "../json-pointer/index.js";

/** RFC 9535 query AST root. `$` + segments. */
export interface Query {
  segments: Segment[];
}

/** RFC 9535 segment — child (`.foo` / `['foo']` / `[0]`) 또는 descendant (`..foo`). */
export type Segment =
  | { kind: "child"; selectors: Selector[] }
  | { kind: "descendant"; selectors: Selector[] };

/** RFC 9535 selector — name / index / slice / wildcard / filter. */
export type Selector =
  | { kind: "name"; name: string }
  | { kind: "index"; index: number }
  | { kind: "slice"; start: number | null; end: number | null; step: number }
  | { kind: "wildcard" }
  | { kind: "filter"; expr: FilterExpr };

/** Filter expression — RFC 9535 §2.3.5. */
export type FilterExpr =
  | { kind: "exists"; path: FilterQuery }
  | { kind: "compare"; op: CompareOp; left: Comparable; right: Comparable }
  | { kind: "function"; fn: FunctionExpr }
  | { kind: "and"; children: FilterExpr[] }
  | { kind: "or"; children: FilterExpr[] }
  | { kind: "not"; child: FilterExpr };

export type CompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type Comparable =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "path"; path: FilterQuery }
  | { kind: "function"; fn: FunctionExpr };

/** FilterQuery — `@.foo`, `@.*.author`, `$..color` 등 filter 내부 query. */
export interface FilterQuery {
  root: "@" | "$";
  segments: Segment[];
}

export interface FunctionExpr {
  name: string;
  args: FunctionArgument[];
}

export type FunctionArgument = Comparable;

/** evaluate 결과 — query 가 매칭한 location 들의 Pointer + value. */
export interface Match {
  pointer: Pointer;
  value: unknown;
}
