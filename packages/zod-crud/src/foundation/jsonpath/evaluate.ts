// foundation/jsonpath/evaluate — Query AST + JSON 입력 → Match[] (Pointer + value).
// RFC 9535 §2 의 normalized 의미. Pointer 는 RFC 6901.

import type { Query, Segment, Selector, FilterExpr, Comparable, FilterQuery, FunctionExpr, Match } from "./types.js";
import { evaluateArrayRegexFilter, evaluateArrayWildcardField } from "./evaluateFastPath.js";
import { evaluateSimpleQuery, evaluateSinglePathQuery } from "./evaluateSimple.js";
import { compiledRegex, escapeSeg, normalizeSliceIndex, objectHasOwn } from "./evaluateShared.js";

export { matchPointersForSimpleQuery } from "./evaluateSimple.js";

/** root JSON 입력에 query 적용 → matches. 결과 순서: RFC 9535 정합 (DFS). */
export function evaluate(query: Query, root: unknown): Match[] {
  const arrayFieldMatches = evaluateArrayWildcardField(query, root);
  if (arrayFieldMatches !== null) return arrayFieldMatches;

  const regexFilterMatches = evaluateArrayRegexFilter(query, root);
  if (regexFilterMatches !== null) return regexFilterMatches;

  const singlePathMatches = evaluateSinglePathQuery(query, root);
  if (singlePathMatches !== null) return singlePathMatches;

  const simpleMatches = evaluateSimpleQuery(query, root);
  if (simpleMatches !== null) return simpleMatches;

  let cur: Match[] = [{ pointer: "", value: root }];
  for (const seg of query.segments) {
    const next: Match[] = [];
    for (const m of cur) {
      next.push(...applySegment(seg, m, root));
    }
    cur = next;
  }
  return cur;
}

function applySegment(seg: Segment, m: Match, root: unknown): Match[] {
  if (seg.kind === "child") {
    const out: Match[] = [];
    for (const sel of seg.selectors) out.push(...applySelector(sel, m, root));
    return out;
  }
  const out: Match[] = [];
  visitDescendants(m, (n) => {
    for (const sel of seg.selectors) out.push(...applySelector(sel, n, root));
  });
  return out;
}

function visitDescendants(m: Match, cb: (n: Match) => void): void {
  cb(m);
  if (m.value === null || typeof m.value !== "object") return;
  if (Array.isArray(m.value)) {
    for (let i = 0; i < m.value.length; i++) {
      visitDescendants({ pointer: m.pointer + "/" + i, value: m.value[i] }, cb);
    }
  } else {
    for (const k of Object.keys(m.value as Record<string, unknown>)) {
      visitDescendants({ pointer: m.pointer + "/" + escapeSeg(k), value: (m.value as Record<string, unknown>)[k] }, cb);
    }
  }
}

function applySelector(sel: Selector, m: Match, root: unknown): Match[] {
  if (sel.kind === "name") {
    if (m.value === null || typeof m.value !== "object" || Array.isArray(m.value)) return [];
    const obj = m.value as Record<string, unknown>;
    if (!objectHasOwn.call(obj, sel.name)) return [];
    return [{ pointer: m.pointer + "/" + escapeSeg(sel.name), value: obj[sel.name] }];
  }
  if (sel.kind === "index") {
    if (!Array.isArray(m.value)) return [];
    let idx = sel.index;
    if (idx < 0) idx = m.value.length + idx;
    if (idx < 0 || idx >= m.value.length) return [];
    return [{ pointer: m.pointer + "/" + idx, value: m.value[idx] }];
  }
  if (sel.kind === "slice") {
    if (!Array.isArray(m.value)) return [];
    const len = m.value.length;
    const step = sel.step;
    if (step === 0) return [];
    const start = normalizeSliceIndex(sel.start, len, step, true);
    const end = normalizeSliceIndex(sel.end, len, step, false);
    const out: Match[] = [];
    if (step > 0) for (let i = start; i < end; i += step) out.push({ pointer: m.pointer + "/" + i, value: m.value[i] });
    else for (let i = start; i > end; i += step) out.push({ pointer: m.pointer + "/" + i, value: m.value[i] });
    return out;
  }
  if (sel.kind === "wildcard") {
    if (m.value === null || typeof m.value !== "object") return [];
    if (Array.isArray(m.value)) {
      return m.value.map((v, i) => ({ pointer: m.pointer + "/" + i, value: v }));
    }
    const obj = m.value as Record<string, unknown>;
    return Object.keys(obj).map((k) => ({ pointer: m.pointer + "/" + escapeSeg(k), value: obj[k] }));
  }
  if (sel.kind === "filter") {
    if (m.value === null || typeof m.value !== "object") return [];
    const out: Match[] = [];
    if (Array.isArray(m.value)) {
      for (let i = 0; i < m.value.length; i++) {
        const cm = { pointer: m.pointer + "/" + i, value: m.value[i] };
        if (evalFilter(sel.expr, cm, root)) out.push(cm);
      }
    } else {
      const obj = m.value as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const cm = { pointer: m.pointer + "/" + escapeSeg(k), value: obj[k] };
        if (evalFilter(sel.expr, cm, root)) out.push(cm);
      }
    }
    return out;
  }
  return [];
}

function evalFilter(expr: FilterExpr, current: Match, root: unknown): boolean {
  if (expr.kind === "exists") {
    return resolveFilterQuery(expr.path, current, root).length > 0;
  }
  if (expr.kind === "compare") {
    const l = resolveComparable(expr.left, current, root);
    const r = resolveComparable(expr.right, current, root);
    switch (expr.op) {
      case "==": return jsonEqual(l, r);
      case "!=": return !jsonEqual(l, r);
      case "<": return compareOrdered(l, r, (left, right) => left < right);
      case "<=": return jsonEqual(l, r) || compareOrdered(l, r, (left, right) => left <= right);
      case ">": return compareOrdered(l, r, (left, right) => left > right);
      case ">=": return jsonEqual(l, r) || compareOrdered(l, r, (left, right) => left >= right);
    }
  }
  if (expr.kind === "function") return resolveFunctionAsLogical(expr.fn, current, root);
  if (expr.kind === "and") return expr.children.every((c) => evalFilter(c, current, root));
  if (expr.kind === "or") return expr.children.some((c) => evalFilter(c, current, root));
  if (expr.kind === "not") return !evalFilter(expr.child, current, root);
  return false;
}

function resolveComparable(c: Comparable, current: Match, root: unknown): unknown {
  if (c.kind === "literal") return c.value;
  if (c.kind === "function") return resolveFunctionAsValue(c.fn, current, root);
  const matches = resolveFilterQuery(c.path, current, root);
  return matches.length === 1 ? matches[0]?.value : NOTHING;
}

function resolveFilterQuery(path: FilterQuery, current: Match, root: unknown): Match[] {
  let cur: Match[] = [path.root === "@" ? current : { pointer: "", value: root }];
  for (const seg of path.segments) {
    const next: Match[] = [];
    for (const match of cur) next.push(...applySegment(seg, match, root));
    cur = next;
  }
  return cur;
}

function resolveFunctionAsLogical(fn: FunctionExpr, current: Match, root: unknown): boolean {
  const result = resolveFunction(fn, current, root);
  return result.kind === "logical" ? result.value : false;
}

function resolveFunctionAsValue(fn: FunctionExpr, current: Match, root: unknown): unknown {
  const result = resolveFunction(fn, current, root);
  return result.kind === "value" ? result.value : NOTHING;
}

type FunctionResult =
  | { kind: "value"; value: unknown }
  | { kind: "logical"; value: boolean }
  | { kind: "nodes"; value: Match[] }
  | { kind: "nothing" };

function resolveFunction(fn: FunctionExpr, current: Match, root: unknown): FunctionResult {
  switch (fn.name) {
    case "length": {
      if (fn.args.length !== 1) return { kind: "nothing" };
      const value = resolveValueArg(fn.args[0]!, current, root);
      const length = jsonLength(value);
      return length === undefined ? { kind: "nothing" } : { kind: "value", value: length };
    }
    case "count": {
      if (fn.args.length !== 1) return { kind: "nothing" };
      return { kind: "value", value: resolveNodesArg(fn.args[0]!, current, root).length };
    }
    case "match":
    case "search": {
      if (fn.args.length !== 2) return { kind: "logical", value: false };
      const input = resolveValueArg(fn.args[0]!, current, root);
      const pattern = resolveValueArg(fn.args[1]!, current, root);
      if (typeof input !== "string" || typeof pattern !== "string") return { kind: "logical", value: false };
      return { kind: "logical", value: regexTest(input, pattern, fn.name === "match") };
    }
    case "value": {
      if (fn.args.length !== 1) return { kind: "nothing" };
      const nodes = resolveNodesArg(fn.args[0]!, current, root);
      return nodes.length === 1 ? { kind: "value", value: nodes[0]?.value } : { kind: "nothing" };
    }
    default:
      return { kind: "nothing" };
  }
}

function resolveValueArg(arg: Comparable, current: Match, root: unknown): unknown {
  if (arg.kind === "literal") return arg.value;
  if (arg.kind === "function") {
    const result = resolveFunction(arg.fn, current, root);
    if (result.kind === "value" || result.kind === "logical") return result.value;
    if (result.kind === "nodes") return result.value.length === 1 ? result.value[0]?.value : NOTHING;
    return NOTHING;
  }
  const nodes = resolveFilterQuery(arg.path, current, root);
  return nodes.length === 1 ? nodes[0]?.value : NOTHING;
}

function resolveNodesArg(arg: Comparable, current: Match, root: unknown): Match[] {
  if (arg.kind === "path") return resolveFilterQuery(arg.path, current, root);
  if (arg.kind === "function") {
    const result = resolveFunction(arg.fn, current, root);
    return result.kind === "nodes" ? result.value : [];
  }
  return [];
}

function jsonLength(value: unknown): number | undefined {
  if (typeof value === "string") return Array.from(value).length;
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
  return undefined;
}

function regexTest(input: string, pattern: string, full: boolean): boolean {
  const re = compiledRegex(pattern, full);
  return re !== null && re.test(input);
}

const NOTHING = Symbol("JSONPath Nothing");

function compareOrdered(left: unknown, right: unknown, compare: (left: number | string, right: number | string) => boolean): boolean {
  if (left === NOTHING || right === NOTHING) return false;
  if (typeof left === "number" && typeof right === "number") return compare(left, right);
  if (typeof left === "string" && typeof right === "string") return compare(left, right);
  return false;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === NOTHING || right === NOTHING) return left === right;
  if (typeof left === "number" && typeof right === "number") return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => objectHasOwn.call(right, key) && jsonEqual(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 외부 helper — Match[] -> Pointer[]. */
export function matchPointers(matches: Match[]): string[] {
  const pointers = new Array<string>(matches.length);
  for (let index = 0; index < matches.length; index += 1) {
    pointers[index] = matches[index]!.pointer;
  }
  return pointers;
}
