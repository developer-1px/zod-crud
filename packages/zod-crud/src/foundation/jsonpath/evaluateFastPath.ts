import type { FilterExpr, Match, Query } from "./types.js";
import { compiledRegex, escapeSeg, objectHasOwn, plainRegexLiteral } from "./evaluateShared.js";

interface ArrayWildcardFieldQuery {
  arrayName: string;
  fieldName: string;
}

export function evaluateArrayWildcardField(query: Query, root: unknown): Match[] | null {
  const simple = arrayWildcardFieldQuery(query);
  if (simple === null) return null;

  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const rootObject = root as Record<string, unknown>;
  if (!objectHasOwn.call(rootObject, simple.arrayName)) return [];
  const array = rootObject[simple.arrayName];
  if (!Array.isArray(array)) return [];

  const rootPointer = "/" + escapeSeg(simple.arrayName);
  const fieldPointer = "/" + escapeSeg(simple.fieldName);
  const matches = new Array<Match>(array.length);
  let matchCount = 0;
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (
      item !== null
      && typeof item === "object"
      && !Array.isArray(item)
      && objectHasOwn.call(item, simple.fieldName)
    ) {
      matches[matchCount] = {
        pointer: rootPointer + "/" + index + fieldPointer,
        value: (item as Record<string, unknown>)[simple.fieldName],
      };
      matchCount += 1;
    }
  }
  matches.length = matchCount;
  return matches;
}

export function evaluateArrayRegexFilter(query: Query, root: unknown): Match[] | null {
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
  if (!objectHasOwn.call(rootObject, arraySelector.name)) return [];
  const array = rootObject[arraySelector.name];
  if (!Array.isArray(array)) return [];

  const literal = plainRegexLiteral(filter.pattern);
  const regex = literal === null ? compiledRegex(filter.pattern, filter.full) : null;
  if (literal === null && regex === null) return [];

  const arrayPointer = "/" + escapeSeg(arraySelector.name);
  const matches = new Array<Match>(array.length);
  let matchCount = 0;
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const object = item as Record<string, unknown>;
    if (!objectHasOwn.call(object, filter.field)) continue;
    const value = object[filter.field];
    if (typeof value !== "string") continue;
    if (literal === null) {
      if (!regex!.test(value)) continue;
    } else if (filter.full ? value !== literal : !value.includes(literal)) {
      continue;
    }
    matches[matchCount] = { pointer: arrayPointer + "/" + index, value: item };
    matchCount += 1;
  }
  matches.length = matchCount;
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

export function matchArrayWildcardFieldPointers(query: Query, root: unknown): string[] | null {
  const simple = arrayWildcardFieldQuery(query);
  if (simple === null) return null;

  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const rootObject = root as Record<string, unknown>;
  if (!objectHasOwn.call(rootObject, simple.arrayName)) return [];
  const array = rootObject[simple.arrayName];
  if (!Array.isArray(array)) return [];

  const rootPointer = "/" + escapeSeg(simple.arrayName);
  const fieldPointer = "/" + escapeSeg(simple.fieldName);
  const pointers = new Array<string>(array.length);
  let pointerCount = 0;
  for (let index = 0; index < array.length; index += 1) {
    const item = array[index];
    if (
      item !== null
      && typeof item === "object"
      && !Array.isArray(item)
      && objectHasOwn.call(item, simple.fieldName)
    ) {
      pointers[pointerCount] = rootPointer + "/" + index + fieldPointer;
      pointerCount += 1;
    }
  }
  pointers.length = pointerCount;
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
