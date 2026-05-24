import { jsonSerializableError } from "../json.js";
import { appendSegment } from "../json-pointer/index.js";
import { deepCloneTrusted, getValueAt, parseSafe } from "./internal.js";
import { arrayLocation } from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import { validateOperationShape } from "./apply.js";
import type { FastPatchResult, JSONPatchOperation, SameArrayStructuralItem } from "./types.js";
import {
  applyIncreasingArrayAddOpsPatch,
  applyIncreasingArrayAddPatch,
} from "./fastArrayIncreasing.js";
import {
  applyNonIncreasingArrayAddPatch,
  applyNonIncreasingArrayCopyPatch,
} from "./fastArrayAddCopy.js";
import {
  applyAppendThenNonDecreasingRemovePatch,
  applyNonDecreasingArrayRemovePatch,
} from "./fastArrayRemove.js";

export function applySameArrayStructuralPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 1) return { handled: false };

  const increasingAddFast = applyIncreasingArrayAddOpsPatch(state, ops, valuesTrusted);
  if (increasingAddFast !== null) return increasingAddFast;

  let parent: string | null = null;
  const items: SameArrayStructuralItem[] = [];

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || (
        op.op !== "add"
        && op.op !== "remove"
        && op.op !== "copy"
        && op.op !== "move"
      )
      || op.path === ""
    ) {
      return { handled: false };
    }
    const location = arrayLocation(op.path);
    if (!location) return { handled: false };
    if (parent === null) {
      parent = location.parent;
    } else if (location.parent !== parent) {
      return { handled: false };
    }
    if (op.op === "add") {
      if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
      items.push({ op: "add", path: op.path, index: location.index, value: op.value });
    } else if (op.op === "remove") {
      if (location.index === "-") return { handled: false };
      items.push({ op: "remove", path: op.path, index: location.index });
    } else {
      const fromLocation = arrayLocation(op.from);
      if (!fromLocation || fromLocation.parent !== parent || fromLocation.index === "-") {
        return { handled: false };
      }
      items.push({
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: location.index,
      });
    }
  }

  if (parent === null) return { handled: false };
  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const parsedIncreasingAddFast = applyIncreasingArrayAddPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (parsedIncreasingAddFast !== null) return parsedIncreasingAddFast;

  const nonDecreasingRemoveFast = applyNonDecreasingArrayRemovePatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonDecreasingRemoveFast !== null) return nonDecreasingRemoveFast;

  const nonIncreasingAddFast = applyNonIncreasingArrayAddPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonIncreasingAddFast !== null) return nonIncreasingAddFast;

  const nonIncreasingCopyFast = applyNonIncreasingArrayCopyPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonIncreasingCopyFast !== null) return nonIncreasingCopyFast;

  const appendThenRemoveFast = applyAppendThenNonDecreasingRemovePatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (appendThenRemoveFast !== null) return appendThenRemoveFast;

  const single = applySingleStructuralItem(state, parent, parsedParent.segs, current.value, items);
  if (single !== null) return single;

  const next = current.value.slice();
  const applied: JSONPatchOperation[] = [];
  for (const item of items) {
    if (item.op === "add") {
      const index = item.index === "-" ? next.length : item.index;
      if (index < 0 || index > next.length) return { handled: false };
      if (index === next.length) next.push(item.value);
      else next.splice(index, 0, item.value);
      applied.push({ op: "add", path: appendSegment(parent, index), value: item.value });
      continue;
    }

    if (item.op === "remove") {
      if (item.index < 0 || item.index >= next.length) return { handled: false };
      if (item.index === next.length - 1) next.pop();
      else next.splice(item.index, 1);
      applied.push({ op: "remove", path: item.path });
      continue;
    }

    if (item.fromIndex < 0 || item.fromIndex >= next.length) return { handled: false };
    const index = item.index === "-" ? next.length : item.index;
    if (item.op === "copy") {
      if (index < 0 || index > next.length) return { handled: false };
      const value = deepCloneTrusted(next[item.fromIndex]);
      if (index === next.length) next.push(value);
      else next.splice(index, 0, value);
      applied.push({ op: "copy", from: item.from, path: appendSegment(parent, index) });
      continue;
    }

    if (index < 0 || index >= next.length) return { handled: false };
    if (item.fromIndex === index) {
      applied.push({ op: "move", from: item.from, path: appendSegment(parent, index) });
      continue;
    }
    if (Math.abs(item.fromIndex - index) === 1) {
      const value = next[item.fromIndex];
      next[item.fromIndex] = next[index];
      next[index] = value;
    } else {
      const [value] = next.splice(item.fromIndex, 1);
      if (index < 0 || index > next.length) return { handled: false };
      next.splice(index, 0, value);
    }
    applied.push({ op: "move", from: item.from, path: appendSegment(parent, index) });
  }

  const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applySingleStructuralItem(
  state: unknown,
  parent: string,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length !== 1) return null;
  const item = items[0]!;
  if (item.op === "add") {
    const index = item.index === "-" ? current.length : item.index;
    if (index < 0 || index > current.length) return { handled: false };
    if (index !== current.length) return null;
    const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, current.concat([item.value]));
    return stateWithArray === null
      ? { handled: false }
      : { handled: true, state: stateWithArray, applied: [{ op: "add", path: appendSegment(parent, index), value: item.value }] };
  }
  if (item.op === "remove") {
    if (item.index < 0 || item.index >= current.length) return { handled: false };
    if (item.index !== current.length - 1) return null;
    const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, current.slice(0, item.index));
    return stateWithArray === null
      ? { handled: false }
      : { handled: true, state: stateWithArray, applied: [{ op: "remove", path: item.path }] };
  }
  if (item.op !== "copy") return null;
  if (item.fromIndex < 0 || item.fromIndex >= current.length) return { handled: false };
  const index = item.index === "-" ? current.length : item.index;
  if (index < 0 || index > current.length) return { handled: false };
  if (index !== current.length) return null;
  const value = deepCloneTrusted(current[item.fromIndex]);
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, current.concat([value]));
  return stateWithArray === null
    ? { handled: false }
    : {
        handled: true,
        state: stateWithArray,
        applied: [{ op: "copy", from: item.from, path: appendSegment(parent, index) }],
      };
}
