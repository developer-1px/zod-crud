import { appendSegment, type Pointer } from "../json-pointer/pointerCore.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import type { FastPatchResult, JSONPatchOperation, SameArrayStructuralItem } from "./types.js";

export function applyNonDecreasingArrayRemovePatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = -1;
  const removedIndexes = new Array<number>(items.length);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "remove") return null;
    if (item.index < previousIndex) return null;

    const sourceIndex = item.index + itemIndex;
    if (item.index < 0 || sourceIndex >= current.length) return { handled: false };
    removedIndexes[itemIndex] = sourceIndex;
    applied[itemIndex] = { op: "remove", path: item.path };
    previousIndex = item.index;
  }

  const next = new Array<unknown>(current.length - items.length);
  let removeIndex = 0;
  let write = 0;
  for (let index = 0; index < current.length; index += 1) {
    if (removeIndex < removedIndexes.length && index === removedIndexes[removeIndex]) {
      removeIndex += 1;
      continue;
    }
    next[write] = current[index];
    write += 1;
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

export function applyAppendThenNonDecreasingRemovePatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  const values: unknown[] = [];
  const removedIndexes: number[] = [];
  const applied = new Array<JSONPatchOperation>(items.length);
  let removing = false;
  let previousRemoveIndex = -1;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op === "add") {
      if (removing) return null;
      const expectedAppendIndex = current.length + values.length;
      if (item.index !== "-" && item.index !== expectedAppendIndex) return null;
      values.push(item.value);
      applied[itemIndex] = {
        op: "add",
        path: appendSegment(parent, expectedAppendIndex),
        value: item.value,
      };
      continue;
    }

    if (item.op !== "remove") return null;
    removing = true;
    if (item.index < previousRemoveIndex) return null;
    const sourceIndex = item.index + removedIndexes.length;
    if (item.index < 0 || sourceIndex >= current.length) return { handled: false };
    removedIndexes.push(sourceIndex);
    applied[itemIndex] = { op: "remove", path: item.path };
    previousRemoveIndex = item.index;
  }

  if (values.length === 0 || removedIndexes.length === 0) return null;

  const next = new Array<unknown>(current.length - removedIndexes.length + values.length);
  let removeIndex = 0;
  let write = 0;
  for (let index = 0; index < current.length; index += 1) {
    if (removeIndex < removedIndexes.length && index === removedIndexes[removeIndex]) {
      removeIndex += 1;
      continue;
    }
    next[write] = current[index];
    write += 1;
  }
  for (let index = 0; index < values.length; index += 1) {
    next[write] = values[index];
    write += 1;
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}
