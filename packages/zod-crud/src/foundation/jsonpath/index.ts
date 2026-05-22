// foundation/jsonpath — RFC 9535 JSONPath. 자체 구현 (외부 의존 0).
// 1차 구현 범위:
//   ✓ $ root, .name / ['name'] / [n] / [start:end:step] / *
//   ✓ .. descendant
//   ✓ filter [?<expr>] — comparisons (==/!=/</<=/>/>=) + logical (&&/||/!) + exists
//   ✓ RFC 9535 function extensions — length/count/match/search/value
//
// API:
//   parse(query) → Query AST
//   evaluate(query, root) → Match[]    // pointer + value 쌍
//   query(query, root) → Pointer[]      // shorthand
//
// SPEC §0.3 (2) 표준 Path: RFC 6901 + RFC 9535. JSONPath query → Pointer[] 환원.

import { parse } from "./parser.js";
import { evaluate, matchPointers } from "./evaluate.js";
import type { Pointer } from "../json-pointer/index.js";
import type { Match } from "./types.js";

export { parse, evaluate, matchPointers };
export { JSONPathSyntaxError } from "./tokenizer.js";
export type { Query, Match } from "./types.js";

/** shorthand: query string + root → Pointer[]. */
export function query(jsonpath: string, root: unknown): Pointer[] {
  const ast = parse(jsonpath);
  return matchPointers(evaluate(ast, root));
}

/** shorthand with values: query string + root → Match[]. */
export function queryMatches(jsonpath: string, root: unknown): Match[] {
  const ast = parse(jsonpath);
  return evaluate(ast, root);
}
