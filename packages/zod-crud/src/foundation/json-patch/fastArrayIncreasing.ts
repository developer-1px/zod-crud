import { jsonSerializableError } from "../json.js";
import { appendSegment, type Pointer } from "../json-pointer/index.js";
import { getValueAt, parseSafe } from "./internal.js";
import { arrayLocation } from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import { validateOperationShape } from "./apply.js";
import type { FastPatchResult, JSONPatchOperation, SameArrayStructuralItem } from "./types.js";

export function applyIncreasingArrayAddOpsPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): FastPatchResult | null {
  if (ops.length < 2) return null;
  const first = ops[0];
  if (
    first === undefined
    || validateOperationShape(first) !== null
    || first.op !== "add"
    || first.path === ""
    || first.path.endsWith("/-")
  ) {
    return null;
  }

  const firstLocation = arrayLocation(first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;

  const parent = firstLocation.parent;
  const start = firstLocation.index;
  const values = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || op.path === ""
      || op.path.endsWith("/-")
    ) {
      return null;
    }

    const location = arrayLocation(op.path);
    if (location === null || location.index === "-" || location.parent !== parent) return null;
    if (location.index !== start + index) return null;
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    values[index] = op.value;
    applied[index] = {
      op: "add",
      path: appendSegment(parent, location.index),
      value: op.value,
    };
  }

  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };
  if (start < 0 || start > current.value.length) return { handled: false };

  const next = start === current.value.length
    ? current.value.concat(values)
    : current.value.slice(0, start).concat(values, current.value.slice(start));
  const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

export function applyIncreasingArrayAddPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 1) return null;

  let start = -1;
  const values = new Array<unknown>(items.length);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.op !== "add" || item.index === "-") return null;
    if (index === 0) {
      start = item.index;
      if (start < 0 || start > current.length) return { handled: false };
    } else if (item.index !== start + index) {
      return null;
    }
    values[index] = item.value;
    applied[index] = {
      op: "add",
      path: appendSegment(parent, start + index),
      value: item.value,
    };
  }

  const next = start === current.length
    ? current.concat(values)
    : current.slice(0, start).concat(values, current.slice(start));
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}
