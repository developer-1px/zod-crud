// foundation/jsonpath — RFC 9535 JSONPath. 자체 구현 (외부 의존 0).
// 1차 구현 범위:
//   ✓ $ root, .name / ['name'] / [n] / [start:end:step] / *
//   ✓ .. descendant
//   ✓ filter [?<expr>] — comparisons (==/!=/</<=/>/>=) + logical (&&/||/!) + exists
//   ✓ RFC 9535 function extensions — length/count/match/search/value
//
// API:
//   query(query, root) → Pointer[]      // shorthand
//   queryMatches(query, root) → Match[] // pointer + value 쌍
//
// SPEC §0.3 (2) 표준 Path: RFC 6901 + RFC 9535. JSONPath query → Pointer[] 환원.

import { parse as parseJsonPath } from "./parser.js";
import { evaluate, matchPointers } from "./evaluate.js";
import { matchPointersForSimpleQuery } from "./evaluateSimple.js";
import type { Pointer } from "../json-pointer/pointerCore.js";
import type { Match, Query } from "./types.js";

const QUERY_CACHE_LIMIT = 128;
const queryCache = new Map<string, Query>();
let lastQueryText: string | undefined;
let lastQueryAst: Query | undefined;

/** shorthand: query string + root → Pointer[]. */
export function query(jsonpath: string, root: unknown): Pointer[] {
  const ast = cachedParse(jsonpath);
  const simplePointers = matchPointersForSimpleQuery(ast, root);
  if (simplePointers !== null) return simplePointers;
  return matchPointers(evaluate(ast, root));
}

/** shorthand with values: query string + root → Match[]. */
export function queryMatches(jsonpath: string, root: unknown): Match[] {
  const ast = cachedParse(jsonpath);
  return evaluate(ast, root);
}

function cachedParse(jsonpath: string): Query {
  if (jsonpath === lastQueryText && lastQueryAst !== undefined) return lastQueryAst;

  const cached = queryCache.get(jsonpath);
  if (cached !== undefined) {
    queryCache.delete(jsonpath);
    queryCache.set(jsonpath, cached);
    lastQueryText = jsonpath;
    lastQueryAst = cached;
    return cached;
  }

  const ast = parseJsonPath(jsonpath);
  queryCache.set(jsonpath, ast);
  if (queryCache.size > QUERY_CACHE_LIMIT) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  lastQueryText = jsonpath;
  lastQueryAst = ast;
  return ast;
}
