// computeInverses — undo 용 RFC 6902 inverse op 계산.

import { appendSegment, parentPointer, parsePointer, readAt } from "../json-pointer/index.js";
import type { JSONPatchOperation } from "./index.js";
import { applyOpRaw } from "./apply.js";
import { deepCloneTrusted, getValueAt, resolveAppendPath } from "./internal.js";

const objectHasOwn = Object.prototype.hasOwnProperty;

interface ArrayFieldPath {
  arrayPath: string;
  index: number;
  key: string;
}

function inverseOp(op: JSONPatchOperation, before: unknown): JSONPatchOperation | null {
  switch (op.op) {
    case "add":
    case "copy": {
      const path = resolveAppendPath(op.path, before);
      return { op: "remove", path };
    }
    case "remove": {
      const prev = readValueAtPointer(before, op.path);
      if (!prev.ok) return null;
      return { op: "add", path: op.path, value: prev.value };
    }
    case "replace": {
      if (op.path === "") return { op: "replace", path: "", value: before };
      const prev = readValueAtPointer(before, op.path);
      if (!prev.ok) return null;
      return { op: "replace", path: op.path, value: prev.value };
    }
    case "move": {
      // 단순화: append marker 만 idx 로 resolve. 그 외엔 양방향 swap.
      const path = resolveAppendPath(op.path, before);
      return { op: "move", from: path, path: op.from };
    }
    case "test": return null;
  }
}

// forward 를 순서대로 적용하며 매 단계 inverse 를 계산. 반환: undo 시 그대로 applyPatch 에 넘기면 forward 가 되돌려진다.
export function computeInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | { ok: false } {
  if (ops.length === 1 && 0 in ops) return computeSingleInverse(state, ops[0]!);
  const arrayFieldReplace = computeSameArrayFieldReplaceInverses(state, ops);
  if (arrayFieldReplace) return arrayFieldReplace;
  const replaceOnly = computeIndependentReplaceInverses(state, ops);
  if (replaceOnly) return replaceOnly;
  const arrayOnly = computeSameArrayStructuralInverses(state, ops);
  if (arrayOnly) return arrayOnly;

  const out: JSONPatchOperation[] = [];
  let cur: unknown = state;
  for (const op of ops) {
    const inv = inverseOp(op, cur);
    const r = applyOpRaw(cur, op);
    if ("error" in r) return { ok: false };
    if (inv) out.push(inv);
    cur = r.state;
  }
  return { ok: true, inverses: out.reverse() };
}

function computeSingleInverse(
  state: unknown,
  op: JSONPatchOperation,
): { ok: true; inverses: JSONPatchOperation[] } | { ok: false } {
  const inverse = inverseOp(op, state);
  if (inverse === null) return op.op === "test" ? { ok: true, inverses: [] } : { ok: false };
  return { ok: true, inverses: [inverse] };
}

function computeSameArrayFieldReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let arrayPath: string | null = null;
  let field: string | null = null;
  const seenIndexes = new Set<number>();
  const items: Array<{ path: string; index: number; key: string }> = [];

  for (const op of ops) {
    if (op.op === "test") continue;
    if (op.op !== "replace" || op.path === "") return null;
    const location = parseArrayFieldPath(op.path);
    if (location === null) return null;
    if (field === null) field = location.key;
    else if (field !== location.key) return null;

    if (arrayPath === null) arrayPath = location.arrayPath;
    else if (arrayPath !== location.arrayPath) return null;

    if (seenIndexes.has(location.index)) return null;
    seenIndexes.add(location.index);
    items.push({ path: op.path, index: location.index, key: location.key });
  }

  if (arrayPath === null || field === null) return null;
  const array = readAt(state, parsePointer(arrayPath));
  if (!array.ok || !Array.isArray(array.value)) return null;

  const inverses: JSONPatchOperation[] = [];
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = items[itemIndex]!;
    if (item.index < 0 || item.index >= array.value.length) return null;
    const row = array.value[item.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
    if (!objectHasOwn.call(row, item.key)) return null;
    inverses.push({ op: "replace", path: item.path, value: (row as Record<string, unknown>)[item.key] });
  }

  return { ok: true, inverses };
}

type SameArrayStructuralOp =
  | { op: "add"; path: string; index: number | "-"; value: unknown }
  | { op: "remove"; path: string; index: number }
  | { op: "copy"; from: string; path: string; fromIndex: number; index: number | "-" }
  | { op: "move"; from: string; path: string; fromIndex: number; index: number | "-" };

function computeSameArrayStructuralInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 1) return null;

  let parent: string | null = null;
  let hasRemove = false;
  const parsed: SameArrayStructuralOp[] = [];

  for (const op of ops) {
    if (op.op !== "add" && op.op !== "remove" && op.op !== "copy" && op.op !== "move") return null;
    const location = arrayLocation(op.path);
    if (!location) return null;
    if (parent === null) {
      parent = location.parent;
    } else if (location.parent !== parent) {
      return null;
    }
    if (op.op === "add") {
      parsed.push({ op: "add", path: op.path, index: location.index, value: op.value });
    } else if (op.op === "remove") {
      if (location.index === "-") return null;
      hasRemove = true;
      parsed.push({ op: "remove", path: op.path, index: location.index });
    } else {
      const fromLocation = arrayLocation(op.from);
      if (!fromLocation || fromLocation.parent !== parent || fromLocation.index === "-") return null;
      parsed.push({
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: location.index,
      });
    }
  }

  if (parent === null) return null;
  const array = readAt(state, parsePointer(parent));
  if (!array.ok || !Array.isArray(array.value)) return null;

  if (!hasRemove) {
    return computeSameArrayStructuralInversesWithoutRemovedValues(parent, array.value.length, parsed);
  }

  const cur = array.value.slice();
  const inverses: JSONPatchOperation[] = [];
  for (const op of parsed) {
    if (op.op === "add") {
      const index = op.index === "-" ? cur.length : op.index;
      if (index < 0 || index > cur.length) return null;
      if (index === cur.length) cur.push(op.value);
      else cur.splice(index, 0, op.value);
      inverses.push({ op: "remove", path: appendSegment(parent, index) });
      continue;
    }

    if (op.op === "remove") {
      if (op.index < 0 || op.index >= cur.length) return null;
      const value = cur[op.index];
      if (op.index === cur.length - 1) cur.pop();
      else cur.splice(op.index, 1);
      inverses.push({ op: "add", path: op.path, value });
      continue;
    }

    if (op.fromIndex < 0 || op.fromIndex >= cur.length) return null;
    const index = op.index === "-" ? cur.length : op.index;
    const concretePath = appendSegment(parent, index);
    if (op.op === "copy") {
      if (index < 0 || index > cur.length) return null;
      const value = deepCloneTrusted(cur[op.fromIndex]);
      if (index === cur.length) cur.push(value);
      else cur.splice(index, 0, value);
      inverses.push({ op: "remove", path: concretePath });
      continue;
    }

    if (index < 0 || index >= cur.length) return null;
    inverses.push({ op: "move", from: concretePath, path: op.from });
    if (op.fromIndex === index) continue;
    if (Math.abs(op.fromIndex - index) === 1) {
      const value = cur[op.fromIndex];
      cur[op.fromIndex] = cur[index];
      cur[index] = value;
    } else {
      const [value] = cur.splice(op.fromIndex, 1);
      if (index < 0 || index > cur.length) return null;
      cur.splice(index, 0, value);
    }
  }

  return { ok: true, inverses: inverses.reverse() };
}

function computeSameArrayStructuralInversesWithoutRemovedValues(
  parent: string,
  initialLength: number,
  ops: ReadonlyArray<SameArrayStructuralOp>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  let length = initialLength;
  const inverses: JSONPatchOperation[] = [];

  for (const op of ops) {
    if (op.op === "remove") return null;
    if (op.op === "add") {
      const index = op.index === "-" ? length : op.index;
      if (index < 0 || index > length) return null;
      inverses.push({ op: "remove", path: appendSegment(parent, index) });
      length += 1;
      continue;
    }
    if (op.op === "copy") {
      if (op.fromIndex < 0 || op.fromIndex >= length) return null;
      const index = op.index === "-" ? length : op.index;
      if (index < 0 || index > length) return null;
      inverses.push({ op: "remove", path: appendSegment(parent, index) });
      length += 1;
      continue;
    }

    if (op.fromIndex < 0 || op.fromIndex >= length) return null;
    const index = op.index === "-" ? length : op.index;
    if (index < 0 || index >= length) return null;
    inverses.push({ op: "move", from: appendSegment(parent, index), path: op.from });
  }

  return { ok: true, inverses: inverses.reverse() };
}

function computeIndependentReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  const parsed: Array<{ path: string; segments: string[] }> = [];
  for (const op of ops) {
    if (op.op === "test") continue;
    if (op.op !== "replace" || op.path === "") return null;
    parsed.push({ path: op.path, segments: parsePointer(op.path) });
  }

  if (!hasIndependentPaths(parsed)) return null;

  const out: JSONPatchOperation[] = [];
  for (let index = parsed.length - 1; index >= 0; index--) {
    const item = parsed[index]!;
    const prev = getValueAt(state, item.segments);
    if (!prev.ok) return null;
    out.push({ op: "replace", path: item.path, value: prev.value });
  }
  return { ok: true, inverses: out };
}

function hasIndependentPaths(paths: ReadonlyArray<{ path: string; segments: string[] }>): boolean {
  const sorted = paths.map((item) => item.path).sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) {
      return false;
    }
  }
  return true;
}

function sameSegments(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function arrayLocation(path: string): { parent: string; index: number | "-" } | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent, index };
}

function numericSegment(segment: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  return Number(segment);
}

function readValueAtPointer(
  state: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } {
  const simple = readSimplePointerValue(state, path);
  return simple ?? readAt(state, parsePointer(path));
}

function readSimplePointerValue(
  state: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } | null {
  if (path === "") return { ok: true, value: state };
  if (path[0] !== "/" || path.includes("~")) return null;

  let current = state;
  let start = 1;
  while (true) {
    const nextSlash = path.indexOf("/", start);
    const segment = nextSlash === -1 ? path.slice(start) : path.slice(start, nextSlash);

    if (current === null || current === undefined) return { ok: false };
    if (Array.isArray(current)) {
      const index = numericSegment(segment);
      if (index === null || index >= current.length) return { ok: false };
      current = current[index];
    } else if (typeof current === "object") {
      if (!objectHasOwn.call(current, segment)) return { ok: false };
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { ok: false };
    }

    if (nextSlash === -1) return { ok: true, value: current };
    start = nextSlash + 1;
  }
}

function parseArrayFieldPath(path: string): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 2) return null;

  const index = numericSegment(segments[segments.length - 2]!);
  if (index === null) return null;
  const arrayPath = segments.length === 2
    ? ""
    : `/${segments.slice(0, -2).map(escapePointerSegment).join("/")}`;
  return { arrayPath, index, key: segments[segments.length - 1]! };
}

function parseSimpleArrayFieldPath(path: string): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  return index === null
    ? null
    : { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
