// computeInverses — undo 용 RFC 6902 inverse op 계산.

import type { JSONPatchOperation } from "./contract.js";
import { appendSegment, parsePointer, readAt } from "../pointer/index.js";
import { cloneTrustedPlainJson } from "../json/trustedClone.js";
import { applyOpRaw } from "./apply.js";
import { getValueAt, resolveAppendPath } from "./container.js";
import { objectHasOwn } from "./object.js";
import {
  arrayFieldText,
  arrayLocation,
  arrayRemoveLocation,
  numericSegment,
  parseArrayFieldPath,
  parseFirstArrayNestedPath,
  parseKnownArrayFieldIndex,
  parseKnownArrayNestedIndex,
} from "./path.js";
import type {
  ArrayFieldPath,
  ArrayFieldText,
  ArrayNestedPath,
} from "./path.js";

type SeenRootKeys = Record<string, true>;

type SameArrayStructuralOp =
  | { op: "add"; path: string; index: number | "-"; value: unknown }
  | { op: "remove"; path: string; index: number }
  | { op: "copy"; from: string; path: string; fromIndex: number; index: number | "-" }
  | { op: "move"; from: string; path: string; fromIndex: number; index: number | "-" };

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
      const path = resolveAppendPath(op.path, before);
      return { op: "move", from: path, path: op.from };
    }
    case "test": return null;
  }
}

export function computeInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | { ok: false } {
  if (ops.length === 1 && 0 in ops) return computeSingleInverse(state, ops[0]!);
  const appendOnly = computeAppendOnlyAddInverses(state, ops);
  if (appendOnly) return appendOnly;
  const arrayFieldReplace = computeSameArrayFieldReplaceInverses(state, ops);
  if (arrayFieldReplace) return arrayFieldReplace;
  const arrayElementReplace = computeSameArrayElementReplaceInverses(state, ops);
  if (arrayElementReplace) return arrayElementReplace;
  const rootObjectReplace = computeRootObjectReplaceInverses(state, ops);
  if (rootObjectReplace) return rootObjectReplace;
  const rootObjectRemove = computeRootObjectRemoveInverses(state, ops);
  if (rootObjectRemove) return rootObjectRemove;
  const rootObjectAdd = computeRootObjectAddInverses(state, ops);
  if (rootObjectAdd) return rootObjectAdd;
  const arrayRemoveOnly = computeNonDecreasingArrayRemoveInverses(state, ops);
  if (arrayRemoveOnly) return arrayRemoveOnly;
  const appendThenRemove = computeAppendThenNonDecreasingRemoveInverses(state, ops);
  if (appendThenRemove) return appendThenRemove;
  const arrayNestedReplace = computeSameArrayNestedReplaceInverses(state, ops);
  if (arrayNestedReplace) return arrayNestedReplace;
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

function computeRootObjectReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const seenKeys = createSeenRootKeys();
  let inverseCount = 0;
  const inverses = new Array<JSONPatchOperation | undefined>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (op.op === "test") continue;
    if (
      op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(state, key)) return null;
    if (seenKeys[key] === true) return null;
    seenKeys[key] = true;

    inverses[ops.length - index - 1] = {
      op: "replace",
      path: op.path,
      value: (state as Record<string, unknown>)[key],
    };
    inverseCount += 1;
  }

  if (inverseCount === 0) return null;
  if (inverseCount === inverses.length) return { ok: true, inverses: inverses as JSONPatchOperation[] };

  const compacted: JSONPatchOperation[] = [];
  for (const inverse of inverses) {
    if (inverse !== undefined) compacted.push(inverse);
  }
  return { ok: true, inverses: compacted };
}

function computeRootObjectRemoveInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const seenKeys = createSeenRootKeys();
  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (!objectHasOwn.call(state, key)) return null;
    if (seenKeys[key] === true) return null;
    seenKeys[key] = true;

    inverses[ops.length - index - 1] = {
      op: "add",
      path: op.path,
      value: (state as Record<string, unknown>)[key],
    };
  }

  return { ok: true, inverses };
}

function computeRootObjectAddInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  let seenKeys: Set<string> | null = null;
  const source = state as Record<string, unknown>;
  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (seenKeys === null) seenKeys = new Set();
    else if (seenKeys.has(key)) return null;
    seenKeys.add(key);

    inverses[ops.length - index - 1] = objectHasOwn.call(source, key)
      ? { op: "replace", path: op.path, value: source[key] }
      : { op: "remove", path: op.path };
  }

  return { ok: true, inverses };
}

function createSeenRootKeys(): SeenRootKeys {
  return Object.create(null) as SeenRootKeys;
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

function seedSimpleArrayNestedReplaceIndexes(
  inverses: ReadonlyArray<JSONPatchOperation>,
  location: ArrayNestedPath,
): Set<number> {
  const seen = new Set<number>();
  for (const inverse of inverses) {
    const index = parseKnownArrayNestedIndex(
      inverse.path,
      location.arrayPath,
      location.suffixSegments,
      location.prefixText,
      location.suffixText,
    );
    if (index !== null) seen.add(index);
  }
  return seen;
}

function computeSameArrayFieldReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let arrayPath: string | null = null;
  let field: string | null = null;
  let fieldText: ArrayFieldText | null = null;
  let arrayValue: unknown[] | null = null;
  let seenIndexes: Set<number> | null = null;
  let previousEmittedIndex: number | null = null;
  const inverses: JSONPatchOperation[] = [];

  for (let opIndex = ops.length - 1; opIndex >= 0; opIndex -= 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (op.op === "test") continue;
    if (op.op !== "replace" || op.path === "") return null;
    const knownIndex = fieldText === null ? null : parseKnownArrayFieldIndex(op.path, fieldText);
    let location: ArrayFieldPath | null;
    if (knownIndex === null) {
      location = parseArrayFieldPath(op.path);
    } else {
      if (arrayPath === null || field === null) return null;
      location = { arrayPath, index: knownIndex, key: field };
    }
    if (location === null) return null;
    if (field === null) {
      field = location.key;
      fieldText = arrayFieldText(op.path);
    } else if (field !== location.key) return null;

    if (arrayPath === null) {
      arrayPath = location.arrayPath;
      const array = readValueAtPointer(state, arrayPath);
      if (!array.ok || !Array.isArray(array.value)) return null;
      arrayValue = array.value;
    } else if (arrayPath !== location.arrayPath) {
      return null;
    }

    if (arrayValue === null || location.index < 0 || location.index >= arrayValue.length) return null;
    const row = arrayValue[location.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
    if (!objectHasOwn.call(row, location.key)) return null;
    if (seenIndexes !== null) {
      if (seenIndexes.has(location.index)) continue;
      seenIndexes.add(location.index);
    } else if (previousEmittedIndex !== null && location.index >= previousEmittedIndex) {
      seenIndexes = seedArrayFieldReplaceIndexes(inverses);
      if (seenIndexes.has(location.index)) continue;
      seenIndexes.add(location.index);
    }
    previousEmittedIndex = location.index;
    inverses.push({
      op: "replace",
      path: op.path,
      value: (row as Record<string, unknown>)[location.key],
    });
  }

  if (arrayPath === null || field === null || arrayValue === null) return null;
  return { ok: true, inverses };
}

function computeSameArrayElementReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let parent: string | null = null;
  let arrayValue: unknown[] | null = null;
  let seenIndexes: Set<number> | null = null;
  let previousEmittedIndex: number | null = null;
  const inverses: JSONPatchOperation[] = [];

  for (let opIndex = ops.length - 1; opIndex >= 0; opIndex -= 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (op.op !== "replace" || typeof op.path !== "string" || op.path === "") return null;
    const location = arrayRemoveLocation(op.path);
    if (location === null) return null;

    if (parent === null) {
      parent = location.parent;
      const array = readValueAtPointer(state, parent);
      if (!array.ok || !Array.isArray(array.value)) return null;
      arrayValue = array.value;
    } else if (parent !== location.parent) {
      return null;
    }

    if (arrayValue === null || location.index < 0 || location.index >= arrayValue.length) return null;
    if (seenIndexes !== null) {
      if (seenIndexes.has(location.index)) continue;
      seenIndexes.add(location.index);
    } else if (previousEmittedIndex !== null && location.index >= previousEmittedIndex) {
      seenIndexes = seedArrayElementReplaceIndexes(inverses);
      if (seenIndexes.has(location.index)) continue;
      seenIndexes.add(location.index);
    }
    previousEmittedIndex = location.index;
    inverses.push({
      op: "replace",
      path: op.path,
      value: arrayValue[location.index],
    });
  }

  return parent === null || arrayValue === null ? null : { ok: true, inverses };
}

function computeSameArrayNestedReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let location: ArrayNestedPath | null = null;
  let arrayValue: unknown[] | null = null;
  let seenIndexes: Set<number> | null = null;
  let previousEmittedIndex: number | null = null;
  const inverses: JSONPatchOperation[] = [];

  for (let opIndex = ops.length - 1; opIndex >= 0; opIndex -= 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (op.op === "test") continue;
    if (op.op !== "replace" || typeof op.path !== "string" || op.path === "") return null;

    let index: number | null;
    if (location === null) {
      location = parseFirstArrayNestedPath(state, op.path);
      if (location === null) return null;
      index = location.index;
      const array = getValueAt(state, location.arraySegments);
      if (!array.ok || !Array.isArray(array.value)) return null;
      arrayValue = array.value;
    } else {
      index = parseKnownArrayNestedIndex(
        op.path,
        location.arrayPath,
        location.suffixSegments,
        location.prefixText,
        location.suffixText,
      );
      if (index === null) return null;
    }

    if (arrayValue === null || index < 0 || index >= arrayValue.length) return null;
    if (seenIndexes !== null) {
      if (seenIndexes.has(index)) continue;
      seenIndexes.add(index);
    } else if (previousEmittedIndex !== null && index >= previousEmittedIndex) {
      seenIndexes = seedSimpleArrayNestedReplaceIndexes(inverses, location);
      if (seenIndexes.has(index)) continue;
      seenIndexes.add(index);
    }

    const previous = getValueAt(arrayValue[index], location.suffixSegments);
    if (!previous.ok) return null;
    previousEmittedIndex = index;
    inverses.push({ op: "replace", path: op.path, value: previous.value });
  }

  return location === null || arrayValue === null ? null : { ok: true, inverses };
}

function seedArrayFieldReplaceIndexes(inverses: ReadonlyArray<JSONPatchOperation>): Set<number> {
  const seen = new Set<number>();
  for (const inverse of inverses) {
    const location = parseArrayFieldPath(inverse.path);
    if (location !== null) seen.add(location.index);
  }
  return seen;
}

function seedArrayElementReplaceIndexes(inverses: ReadonlyArray<JSONPatchOperation>): Set<number> {
  const seen = new Set<number>();
  for (const inverse of inverses) {
    const location = arrayRemoveLocation(inverse.path);
    if (location !== null) seen.add(location.index);
  }
  return seen;
}

function computeAppendOnlyAddInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let parent: string | undefined;
  let appendPath: string | undefined;
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      op === null
      || typeof op !== "object"
      || op.op !== "add"
      || typeof op.path !== "string"
      || !op.path.endsWith("/-")
    ) {
      return null;
    }
    if (appendPath === undefined) {
      appendPath = op.path;
      parent = op.path.slice(0, -2);
    } else if (op.path !== appendPath) {
      return null;
    }
  }

  if (parent === undefined) return null;
  let array: { ok: true; value: unknown } | { ok: false };
  try {
    array = readValueAtPointer(state, parent);
  } catch {
    return null;
  }
  if (!array.ok || !Array.isArray(array.value)) return null;

  const initialLength = array.value.length;
  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let opIndex = ops.length - 1, inverseIndex = 0; opIndex >= 0; opIndex -= 1, inverseIndex += 1) {
    inverses[inverseIndex] = { op: "remove", path: appendSegment(parent, initialLength + opIndex) };
  }
  return { ok: true, inverses };
}

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
      const value = cloneTrustedPlainJson(cur[op.fromIndex]);
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

function computeNonDecreasingArrayRemoveInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let parent: string | null = null;
  let previousIndex = -1;
  const parsed = new Array<{ path: string; index: number }>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (op.op !== "remove") return null;

    const location = arrayLocation(op.path);
    if (location === null || location.index === "-") return null;
    if (location.index < previousIndex) return null;
    if (parent === null) parent = location.parent;
    else if (location.parent !== parent) return null;

    parsed[opIndex] = { path: op.path, index: location.index };
    previousIndex = location.index;
  }

  if (parent === null) return null;
  const array = readAt(state, parsePointer(parent));
  if (!array.ok || !Array.isArray(array.value)) return null;

  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let opIndex = 0; opIndex < parsed.length; opIndex += 1) {
    const item = parsed[opIndex]!;
    const sourceIndex = item.index + opIndex;
    if (sourceIndex < 0 || sourceIndex >= array.value.length) return null;
    inverses[ops.length - opIndex - 1] = {
      op: "add",
      path: item.path,
      value: array.value[sourceIndex],
    };
  }

  return { ok: true, inverses };
}

function computeAppendThenNonDecreasingRemoveInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (ops.length < 2) return null;

  let parent: string | null = null;
  let adding = true;
  let addCount = 0;
  let previousRemoveIndex = -1;

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return null;
    const op = ops[opIndex]!;
    if (op.op === "add") {
      if (!adding) return null;
      const location = arrayLocation(op.path);
      if (location === null) return null;
      if (parent === null) parent = location.parent;
      else if (location.parent !== parent) return null;
      addCount += 1;
      continue;
    }

    if (op.op !== "remove") return null;
    adding = false;
    const location = arrayLocation(op.path);
    if (location === null || location.index === "-") return null;
    if (location.index < previousRemoveIndex) return null;
    if (parent === null) parent = location.parent;
    else if (location.parent !== parent) return null;
    previousRemoveIndex = location.index;
  }

  if (parent === null || addCount === 0 || addCount === ops.length) return null;
  const array = readAt(state, parsePointer(parent));
  if (!array.ok || !Array.isArray(array.value)) return null;

  const inverses: JSONPatchOperation[] = [];
  for (let opIndex = 0; opIndex < addCount; opIndex += 1) {
    const op = ops[opIndex]!;
    if (op.op !== "add") return null;
    const location = arrayLocation(op.path);
    if (location === null) return null;
    const expectedAppendIndex = array.value.length + opIndex;
    if (location.index !== "-" && location.index !== expectedAppendIndex) return null;
    inverses.push({ op: "remove", path: appendSegment(parent, expectedAppendIndex) });
  }

  let removeCount = 0;
  for (let opIndex = addCount; opIndex < ops.length; opIndex += 1) {
    const op = ops[opIndex]!;
    if (op.op !== "remove") return null;
    const location = arrayLocation(op.path);
    if (location === null || location.index === "-") return null;
    const sourceIndex = location.index + removeCount;
    if (sourceIndex < 0 || sourceIndex >= array.value.length) return null;
    inverses.push({
      op: "add",
      path: op.path,
      value: array.value[sourceIndex],
    });
    removeCount += 1;
  }

  return { ok: true, inverses: inverses.reverse() };
}
