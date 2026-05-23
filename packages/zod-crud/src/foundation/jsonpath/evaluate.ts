// foundation/jsonpath/evaluate — Query AST + JSON 입력 → Match[] (Pointer + value).
// RFC 9535 §2 의 normalized 의미. Pointer 는 RFC 6901.

import type { Query, Segment, Selector, FilterExpr, Comparable, FilterQuery, FunctionExpr, Match } from "./types.js";

const REGEX_CACHE_LIMIT = 128;
const regexCache = new Map<string, RegExp | null>();

/** root JSON 입력에 query 적용 → matches. 결과 순서: RFC 9535 정합 (DFS). */
export function evaluate(query: Query, root: unknown): Match[] {
  const arrayFieldMatches = evaluateArrayWildcardField(query, root);
  if (arrayFieldMatches !== null) return arrayFieldMatches;

  const regexFilterMatches = evaluateArrayRegexFilter(query, root);
  if (regexFilterMatches !== null) return regexFilterMatches;

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

interface ArrayWildcardFieldQuery {
  arrayName: string;
  fieldName: string;
}

function evaluateArrayWildcardField(query: Query, root: unknown): Match[] | null {
  const simple = arrayWildcardFieldQuery(query);
  if (simple === null) return null;

  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const rootObject = root as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rootObject, simple.arrayName)) return [];
  const array = rootObject[simple.arrayName];
  if (!Array.isArray(array)) return [];

  const rootPointer = "/" + escapeSeg(simple.arrayName);
  const fieldPointer = "/" + escapeSeg(simple.fieldName);
  const matches: Match[] = [];
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (
      item !== null
      && typeof item === "object"
      && !Array.isArray(item)
      && Object.prototype.hasOwnProperty.call(item, simple.fieldName)
    ) {
      matches.push({
        pointer: rootPointer + "/" + index + fieldPointer,
        value: (item as Record<string, unknown>)[simple.fieldName],
      });
    }
  }
  return matches;
}

function evaluateArrayRegexFilter(query: Query, root: unknown): Match[] | null {
  if (query.segments.length !== 2) return null;

  const arraySegment = query.segments[0]!;
  const filterSegment = query.segments[1]!;
  if (
    arraySegment.kind !== "child"
    || filterSegment.kind !== "child"
    || arraySegment.selectors.length !== 1
    || filterSegment.selectors.length !== 1
  ) {
    return null;
  }

  const arraySelector = arraySegment.selectors[0]!;
  const filterSelector = filterSegment.selectors[0]!;
  if (arraySelector.kind !== "name" || filterSelector.kind !== "filter") return null;

  const filter = simpleRegexFilter(filterSelector.expr);
  if (filter === null) return null;

  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const rootObject = root as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rootObject, arraySelector.name)) return [];
  const array = rootObject[arraySelector.name];
  if (!Array.isArray(array)) return [];

  const regex = compiledRegex(filter.pattern, filter.full);
  if (regex === null) return [];

  const arrayPointer = "/" + escapeSeg(arraySelector.name);
  const matches: Match[] = [];
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const object = item as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(object, filter.field)) continue;
    const value = object[filter.field];
    if (typeof value !== "string" || !regex.test(value)) continue;
    matches.push({ pointer: arrayPointer + "/" + index, value: item });
  }
  return matches;
}

function simpleRegexFilter(expr: FilterExpr): { field: string; pattern: string; full: boolean } | null {
  if (expr.kind !== "function") return null;

  const { fn } = expr;
  if ((fn.name !== "match" && fn.name !== "search") || fn.args.length !== 2) return null;

  const input = fn.args[0]!;
  const pattern = fn.args[1]!;
  if (input.kind !== "path" || pattern.kind !== "literal" || typeof pattern.value !== "string") return null;
  if (input.path.root !== "@" || input.path.segments.length !== 1) return null;

  const segment = input.path.segments[0]!;
  if (segment.kind !== "child" || segment.selectors.length !== 1) return null;

  const selector = segment.selectors[0]!;
  if (selector.kind !== "name") return null;

  return { field: selector.name, pattern: pattern.value, full: fn.name === "match" };
}

export function matchPointersForSimpleQuery(query: Query, root: unknown): string[] | null {
  const arrayFieldPointers = matchArrayWildcardFieldPointers(query, root);
  if (arrayFieldPointers !== null) return arrayFieldPointers;

  let values: unknown[] = [root];
  let pointers: string[] = [""];

  for (let segmentIndex = 0; segmentIndex < query.segments.length; segmentIndex += 1) {
    const segment = query.segments[segmentIndex]!;
    if (segment.kind !== "child") return null;

    const isFinalSegment = segmentIndex === query.segments.length - 1;
    const nextValues: unknown[] | null = isFinalSegment ? null : [];
    const nextPointers: string[] = [];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex];
      const pointer = pointers[valueIndex]!;
      for (const selector of segment.selectors) {
        if (!applySimpleSelector(selector, value, pointer, nextValues, nextPointers)) return null;
      }
    }
    if (nextValues === null) return nextPointers;
    values = nextValues;
    pointers = nextPointers;
  }

  return pointers;
}

function matchArrayWildcardFieldPointers(query: Query, root: unknown): string[] | null {
  const simple = arrayWildcardFieldQuery(query);
  if (simple === null) return null;

  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const rootObject = root as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rootObject, simple.arrayName)) return [];
  const array = rootObject[simple.arrayName];
  if (!Array.isArray(array)) return [];

  const rootPointer = "/" + escapeSeg(simple.arrayName);
  const fieldPointer = "/" + escapeSeg(simple.fieldName);
  const pointers: string[] = [];
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (
      item !== null
      && typeof item === "object"
      && !Array.isArray(item)
      && Object.prototype.hasOwnProperty.call(item, simple.fieldName)
    ) {
      pointers.push(rootPointer + "/" + index + fieldPointer);
    }
  }
  return pointers;
}

function arrayWildcardFieldQuery(query: Query): ArrayWildcardFieldQuery | null {
  if (query.segments.length !== 3) return null;

  const rootSegment = query.segments[0]!;
  const wildcardSegment = query.segments[1]!;
  const fieldSegment = query.segments[2]!;
  if (
    rootSegment.kind !== "child"
    || wildcardSegment.kind !== "child"
    || fieldSegment.kind !== "child"
    || rootSegment.selectors.length !== 1
    || wildcardSegment.selectors.length !== 1
    || fieldSegment.selectors.length !== 1
  ) {
    return null;
  }

  const rootSelector = rootSegment.selectors[0]!;
  const wildcardSelector = wildcardSegment.selectors[0]!;
  const fieldSelector = fieldSegment.selectors[0]!;
  return rootSelector.kind === "name"
    && wildcardSelector.kind === "wildcard"
    && fieldSelector.kind === "name"
    ? { arrayName: rootSelector.name, fieldName: fieldSelector.name }
    : null;
}

function applySimpleSelector(
  selector: Selector,
  value: unknown,
  pointer: string,
  nextValues: unknown[] | null,
  nextPointers: string[],
): boolean {
  switch (selector.kind) {
    case "name": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
      const object = value as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(object, selector.name)) return true;
      nextValues?.push(object[selector.name]);
      nextPointers.push(pointer + "/" + escapeSeg(selector.name));
      return true;
    }
    case "index": {
      if (!Array.isArray(value)) return true;
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      if (index < 0 || index >= value.length) return true;
      nextValues?.push(value[index]);
      nextPointers.push(pointer + "/" + index);
      return true;
    }
    case "slice": {
      if (!Array.isArray(value)) return true;
      const step = selector.step;
      if (step === 0) return true;
      const start = normalizeSliceIndex(selector.start, value.length, step, true);
      const end = normalizeSliceIndex(selector.end, value.length, step, false);
      if (step > 0) {
        for (let index = start; index < end; index += step) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
      } else {
        for (let index = start; index > end; index += step) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
      }
      return true;
    }
    case "wildcard": {
      if (value === null || typeof value !== "object") return true;
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
        return true;
      }
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index]!;
        nextValues?.push(object[key]);
        nextPointers.push(pointer + "/" + escapeSeg(key));
      }
      return true;
    }
    case "filter":
      return false;
  }
}

function applySegment(seg: Segment, m: Match, root: unknown): Match[] {
  if (seg.kind === "child") {
    const out: Match[] = [];
    for (const sel of seg.selectors) out.push(...applySelector(sel, m, root));
    return out;
  }
  // descendant — 자기 + 모든 자손에 selector 적용
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

function escapeSeg(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

function applySelector(sel: Selector, m: Match, root: unknown): Match[] {
  if (sel.kind === "name") {
    if (m.value === null || typeof m.value !== "object" || Array.isArray(m.value)) return [];
    const obj = m.value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, sel.name)) return [];
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
    // filter — 자식들에 대해 expr 평가, true 인 것만
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

function compiledRegex(pattern: string, full: boolean): RegExp | null {
  const key = `${full ? "match" : "search"}\0${pattern}`;
  if (regexCache.has(key)) return regexCache.get(key)!;

  let compiled: RegExp | null;
  try {
    const translated = translateRegexpDot(pattern);
    compiled = new RegExp(full ? `^(?:${translated})$` : translated, "u");
  } catch {
    compiled = null;
  }

  if (regexCache.size >= REGEX_CACHE_LIMIT) {
    const oldest = regexCache.keys().next().value;
    if (oldest !== undefined) regexCache.delete(oldest);
  }
  regexCache.set(key, compiled);
  return compiled;
}

function translateRegexpDot(pattern: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      out += ch;
      if (i + 1 < pattern.length) out += pattern[++i]!;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      continue;
    }
    if (ch === "]" && inClass) {
      inClass = false;
      out += ch;
      continue;
    }
    out += ch === "." && !inClass ? "[^\\r\\n]" : ch;
  }
  return out;
}

const NOTHING = Symbol("JSONPath Nothing");

function normalizeSliceIndex(index: number | null, len: number, step: number, isStart: boolean): number {
  if (step > 0) {
    const defaultValue = isStart ? 0 : len;
    return clamp(index === null ? defaultValue : (index < 0 ? len + index : index), 0, len);
  }
  const defaultValue = isStart ? len - 1 : -1;
  return clamp(index === null ? defaultValue : (index < 0 ? len + index : index), -1, len - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEqual(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 외부 helper — Match[] → Pointer[] (domain/verbs/find 가 사용). */
export function matchPointers(matches: Match[]): string[] {
  const pointers = new Array<string>(matches.length);
  for (let index = 0; index < matches.length; index += 1) {
    pointers[index] = matches[index]!.pointer;
  }
  return pointers;
}
