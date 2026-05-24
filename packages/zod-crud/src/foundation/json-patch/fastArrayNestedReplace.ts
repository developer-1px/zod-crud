import { jsonSerializableError } from "../json.js";
import type { Pointer } from "../json-pointer/index.js";
import { getValueAt } from "./internal.js";
import {
  parseFirstArrayNestedPath,
  parseKnownArrayNestedIndex,
} from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import { validateOperationShape } from "./apply.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

export function applySameArrayNestedReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let prefixText: string | null = null;
  let suffixText: string | null = null;
  let suffixSegments: string[] | null = null;
  let arrayValue: unknown[] | null = null;
  const updateIndexes = new Array<number>(ops.length);
  const updateValues = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return { handled: false };
    const op = ops[opIndex]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") return { handled: false };
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    let rowIndex: number;
    if (arrayPath === null) {
      const location = parseFirstArrayNestedPath(state, op.path);
      if (location === null) return { handled: false };
      arrayPath = location.arrayPath;
      arraySegments = location.arraySegments;
      prefixText = location.prefixText;
      suffixText = location.suffixText;
      suffixSegments = location.suffixSegments;
      const current = getValueAt(state, location.arraySegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      arrayValue = current.value;
      rowIndex = location.index;
    } else {
      if (suffixSegments === null || prefixText === null || suffixText === null) return { handled: false };
      const parsedIndex = parseKnownArrayNestedIndex(
        op.path,
        arrayPath,
        suffixSegments,
        prefixText,
        suffixText,
      );
      if (parsedIndex === null) return { handled: false };
      rowIndex = parsedIndex;
    }

    if (arrayValue === null || rowIndex < 0 || rowIndex >= arrayValue.length) return { handled: false };
    updateIndexes[opIndex] = rowIndex;
    updateValues[opIndex] = op.value;
    applied[opIndex] = op;
  }

  if (arraySegments === null || suffixSegments === null || arrayValue === null) return { handled: false };
  const next = arrayValue.slice();
  for (let index = 0; index < ops.length; index += 1) {
    const rowIndex = updateIndexes[index]!;
    const value = updateValues[index];
    const replaced = replaceValueAtSegments(arrayValue[rowIndex], suffixSegments, 0, value);
    if (replaced === null) return { handled: false };
    next[rowIndex] = replaced;
  }

  const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}
