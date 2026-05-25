import { jsonSerializableError } from "../jsonSerializable.js";
import type { Pointer } from "../json-pointer/pointerCore.js";
import { getValueAt, parseSafe } from "./internal.js";
import { objectHasOwn } from "./object.js";
import {
  arrayFieldText,
  indexDirection,
  parseArrayFieldPath,
  parseKnownArrayFieldIndex,
} from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import { validateOperationShape } from "./apply.js";
import type { ArrayFieldPath, ArrayFieldText, FastPatchResult, JSONPatchOperation } from "./types.js";

export function applySameArrayFieldReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let field: string | null = null;
  let fieldText: ArrayFieldText | null = null;
  let arrayValue: unknown[] | null = null;
  const updateIndexes = new Array<number>(ops.length);
  const updateValues = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);
  let previousUpdateIndex: number | null = null;
  let monotonicDirection: -1 | 0 | 1 = 0;
  let hasRepeatedOrNonMonotonicIndex = false;

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return { handled: false };
    const op = ops[opIndex]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") return { handled: false };
    const knownIndex = fieldText === null ? null : parseKnownArrayFieldIndex(op.path, fieldText);
    let location: ArrayFieldPath | null;
    if (knownIndex === null) {
      location = parseArrayFieldPath(op.path);
    } else {
      if (arrayPath === null || field === null) return { handled: false };
      location = { arrayPath, index: knownIndex, key: field };
    }
    if (location === null) return { handled: false };
    if (field === null) {
      field = location.key;
      fieldText = arrayFieldText(op.path);
    } else if (field !== location.key) return { handled: false };

    if (arrayValue === null) {
      arrayPath = location.arrayPath;
      const parsedArray = parseSafe(arrayPath);
      if (!("ok" in parsedArray)) return { handled: false };
      arraySegments = parsedArray.segs;
      const current = getValueAt(state, arraySegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      arrayValue = current.value;
    } else if (arrayPath !== location.arrayPath) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    if (arrayValue === null || location.index < 0 || location.index >= arrayValue.length) return { handled: false };
    const row = arrayValue[location.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return { handled: false };
    if (!objectHasOwn.call(row, location.key)) return { handled: false };
    if (previousUpdateIndex !== null) {
      const direction = indexDirection(previousUpdateIndex, location.index);
      if (direction === 0) {
        hasRepeatedOrNonMonotonicIndex = true;
      } else if (monotonicDirection === 0) {
        monotonicDirection = direction;
      } else if (direction !== monotonicDirection) {
        hasRepeatedOrNonMonotonicIndex = true;
      }
    }
    previousUpdateIndex = location.index;
    updateIndexes[opIndex] = location.index;
    updateValues[opIndex] = op.value;
    applied[opIndex] = op;
  }

  if (arraySegments === null || field === null || arrayValue === null) return { handled: false };
  const next = arrayValue.slice();
  if (hasRepeatedOrNonMonotonicIndex) {
    const replacedRows = new Set<number>();
    for (let index = ops.length - 1; index >= 0; index -= 1) {
      const rowIndex = updateIndexes[index]!;
      if (replacedRows.has(rowIndex)) continue;
      replacedRows.add(rowIndex);
      replaceRowField(next, arrayValue, rowIndex, field, updateValues[index]);
    }
    const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
    return stateWithArray === null
      ? { handled: false }
      : { handled: true, state: stateWithArray, applied };
  }
  for (let index = 0; index < ops.length; index += 1) {
    replaceRowField(next, arrayValue, updateIndexes[index]!, field, updateValues[index]);
  }

  const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function replaceRowField(
  next: unknown[],
  source: unknown[],
  rowIndex: number,
  field: string,
  value: unknown,
): void {
  const row = source[rowIndex] as Record<string, unknown>;
  const replaced = { ...row };
  if (field === "__proto__") {
    Object.defineProperty(replaced, field, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    replaced[field] = value;
  }
  next[rowIndex] = replaced;
}
