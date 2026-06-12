import { queryMatches } from "../../foundation/jsonpath/index.js";
import { JSONPathSyntaxError } from "../../foundation/jsonpath/tokenize.js";
import { appendSegment, readAt, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";
import { clonePoint, pointPath, samePoint } from "./point.js";
import type { SelectionPoint } from "./point.js";
import type { SelectionCursorOptions } from "./reducer.js";
import type { SelectionOrderOptions, SelectionScopeOptions } from "./order.js";

type TraversalPointsResult =
  | { ok: true; points: SelectionPoint[] }
  | {
      ok: false;
      code: "invalid_pointer" | "path_not_found" | "syntax_error";
      reason: string;
      pointer: Pointer | null;
    };

export function cursorPoints(
  state: unknown,
  options: SelectionCursorOptions | SelectionOrderOptions,
): TraversalPointsResult {
  if (options.points !== undefined) {
    return explicitCursorPoints(options.points);
  }
  if (options.query !== undefined) {
    return queryCursorPoints(state, options.query);
  }

  return scopedCursorPoints(state, options.scope ?? "", options.includeScope ?? true);
}

export function selectionPoints(
  state: unknown,
  options: SelectionScopeOptions,
): TraversalPointsResult {
  if (options.points !== undefined) {
    return explicitCursorPoints(options.points);
  }
  if (options.query !== undefined) {
    return queryCursorPoints(state, options.query);
  }

  return scopedCursorPoints(state, options.scope ?? "", options.includeScope ?? true);
}

export function emptyTraversalReason(
  kind: "cursor" | "selection",
  options: SelectionCursorOptions | SelectionScopeOptions | SelectionOrderOptions,
): string {
  if (options.points !== undefined) return `${kind} points are empty`;
  if (options.query !== undefined) return `${kind} query matched no points: ${options.query}`;
  return `${kind} scope is empty: ${options.scope ?? ""}`;
}

export function emptyTraversalPointer(
  options: SelectionCursorOptions | SelectionScopeOptions | SelectionOrderOptions,
): Pointer | null {
  return options.query !== undefined ? null : options.scope ?? "";
}

function explicitCursorPoints(
  points: ReadonlyArray<SelectionPoint>,
): { ok: true; points: SelectionPoint[] } | { ok: false; code: "invalid_pointer"; reason: string; pointer: Pointer } {
  const out: SelectionPoint[] = [];
  for (const point of points) {
    const pointer = pointPath(point);
    if (tryParsePointer(pointer) === null) {
      return { ok: false, code: "invalid_pointer", reason: `invalid cursor point pointer: ${pointer}`, pointer };
    }
    if (!out.some((candidate) => samePoint(candidate, point))) out.push(clonePoint(point));
  }
  return { ok: true, points: out };
}

function queryCursorPoints(
  state: unknown,
  jsonpath: string,
): { ok: true; points: SelectionPoint[] } | { ok: false; code: "invalid_pointer" | "syntax_error"; reason: string; pointer: Pointer | null } {
  try {
    return explicitCursorPoints(queryMatches(jsonpath, state).map((match) => match.pointer));
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message, pointer: null };
    }
    throw error;
  }
}

function scopedCursorPoints(
  state: unknown,
  scope: Pointer,
  includeScope: boolean,
): { ok: true; points: SelectionPoint[] } | { ok: false; code: "invalid_pointer" | "path_not_found"; reason: string; pointer: Pointer } {
  const segments = tryParsePointer(scope);
  if (segments === null) {
    return { ok: false, code: "invalid_pointer", reason: `invalid cursor scope pointer: ${scope}`, pointer: scope };
  }
  const value = readAt(state, segments);
  if (!value.ok) {
    return { ok: false, code: "path_not_found", reason: `cursor scope not found: ${scope}`, pointer: scope };
  }
  const pointers = collectPointers(value.value, scope);
  return { ok: true, points: includeScope ? pointers : pointers.slice(1) };
}

function collectPointers(value: unknown, base: Pointer): Pointer[] {
  const pointers: Pointer[] = [base];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      pointers.push(...collectPointers(value[i], appendSegment(base, i)));
    }
  } else if (isObjectRecord(value)) {
    for (const key of Object.keys(value)) {
      pointers.push(...collectPointers(value[key], appendSegment(base, key)));
    }
  }
  return pointers;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
