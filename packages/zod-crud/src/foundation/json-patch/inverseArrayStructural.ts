import { appendSegment, parsePointer, readAt } from "../json-pointer/index.js";
import type { JSONPatchOperation } from "./index.js";
import { deepCloneTrusted } from "./internal.js";
import { arrayLocation, readValueAtPointer } from "./inversePath.js";

type SameArrayStructuralOp =
  | { op: "add"; path: string; index: number | "-"; value: unknown }
  | { op: "remove"; path: string; index: number }
  | { op: "copy"; from: string; path: string; fromIndex: number; index: number | "-" }
  | { op: "move"; from: string; path: string; fromIndex: number; index: number | "-" };

export function computeAppendOnlyAddInverses(
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

export function computeSameArrayStructuralInverses(
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

export function computeNonDecreasingArrayRemoveInverses(
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

export function computeAppendThenNonDecreasingRemoveInverses(
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
