import type { JSONPatchOperation } from "./types.js";
import { getValueAt } from "./internal.js";
import { objectHasOwn } from "./object.js";
import {
  arrayRemoveLocation,
  arrayFieldText,
  parseArrayFieldPath,
  parseFirstArrayNestedPath,
  parseKnownArrayFieldIndex,
  parseKnownArrayNestedIndex,
} from "./path.js";
import type {
  ArrayFieldPath,
  ArrayFieldText,
  ArrayNestedPath,
} from "./types.js";
import {
  readValueAtPointer,
  seedSimpleArrayNestedReplaceIndexes,
} from "./inversePath.js";

export function computeSameArrayFieldReplaceInverses(
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

export function computeSameArrayElementReplaceInverses(
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

export function computeSameArrayNestedReplaceInverses(
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
