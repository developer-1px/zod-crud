import { deepCloneTrusted } from "./internal.js";
import { appendSegment, type Pointer } from "../json-pointer/pointerCore.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import type { FastPatchResult, JSONPatchOperation, SameArrayStructuralItem } from "./types.js";

export function applyNonIncreasingArrayAddPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = Number.POSITIVE_INFINITY;
  const buckets = new Array<unknown[] | undefined>(current.length + 1);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "add" || item.index === "-") return null;
    if (item.index > previousIndex) return null;
    if (item.index < 0 || item.index > current.length) return { handled: false };

    const bucket = buckets[item.index];
    if (bucket === undefined) buckets[item.index] = [item.value];
    else bucket.push(item.value);
    applied[itemIndex] = {
      op: "add",
      path: appendSegment(parent, item.index),
      value: item.value,
    };
    previousIndex = item.index;
  }

  return insertBuckets(state, parentSegments, current, buckets, items.length, applied);
}

export function applyNonIncreasingArrayCopyPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = Number.POSITIVE_INFINITY;
  let previousMinimumInsertIndex = Number.POSITIVE_INFINITY;
  const buckets = new Array<unknown[] | undefined>(current.length + 1);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "copy" || item.index === "-") return null;
    if (item.index > previousIndex) return null;
    if (item.index < 0 || item.index > current.length) return { handled: false };
    if (item.fromIndex < 0 || item.fromIndex >= current.length) return { handled: false };
    if (item.fromIndex >= previousMinimumInsertIndex) return null;

    const value = deepCloneTrusted(current[item.fromIndex]);
    const bucket = buckets[item.index];
    if (bucket === undefined) buckets[item.index] = [value];
    else bucket.push(value);
    applied[itemIndex] = {
      op: "copy",
      from: item.from,
      path: appendSegment(parent, item.index),
    };
    previousIndex = item.index;
    if (item.index < previousMinimumInsertIndex) previousMinimumInsertIndex = item.index;
  }

  return insertBuckets(state, parentSegments, current, buckets, items.length, applied);
}

function insertBuckets(
  state: unknown,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  buckets: ReadonlyArray<unknown[] | undefined>,
  insertCount: number,
  applied: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  const next = new Array<unknown>(current.length + insertCount);
  let write = 0;
  for (let index = 0; index <= current.length; index += 1) {
    const bucket = buckets[index];
    if (bucket !== undefined) {
      for (let bucketIndex = bucket.length - 1; bucketIndex >= 0; bucketIndex -= 1) {
        next[write] = bucket[bucketIndex];
        write += 1;
      }
    }
    if (index < current.length) {
      next[write] = current[index];
      write += 1;
    }
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}
