import { jsonSerializableError } from "../../json/serializable.js";
import { cloneTrustedPlainJson } from "../../json/trustedClone.js";
import { appendSegment, type Pointer } from "../../pointer/index.js";
import { getValueAt, parseSafe } from "../container.js";
import { appendArrayIndexPath, arrayLocation, arrayRemoveLocation } from "../path.js";
import { replaceValueAtSegments } from "../replaceValue.js";
import { validateOperationShape } from "../apply.js";
import type { FastPatchResult, JSONPatchOperation, SameArrayStructuralItem } from "../types.js";

export function applyAppendOnlyAddPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let appendPath: Pointer | null = null;
  const values = new Array<unknown>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      op === null
      || typeof op !== "object"
      || op.op !== "add"
      || typeof op.path !== "string"
      || !("value" in op)
      || !op.path.endsWith("/-")
    ) {
      return { handled: false };
    }

    if (appendPath === null) {
      appendPath = op.path;
      parent = op.path.slice(0, -2);
    } else if (op.path !== appendPath) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    values[index] = op.value;
  }

  if (parent === null) return { handled: false };
  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const initialLength = current.value.length;
  const stateWithArray = replaceValueAtSegments(
    state,
    parsedParent.segs,
    0,
    current.value.concat(values),
  );
  if (stateWithArray === null) return { handled: false };

  const applied = new Array<JSONPatchOperation>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(parent, initialLength + index),
      value: values[index],
    };
  }

  return {
    handled: true,
    state: stateWithArray,
    applied,
  };
}

export function applyTailRemovePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  let currentArray: unknown[] | null = null;
  let initialLength = 0;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      op === null
      || typeof op !== "object"
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return { handled: false };
    }

    const location = arrayRemoveLocation(op.path);
    if (location === null) return { handled: false };

    if (parent === null) {
      parent = location.parent;
      const parsedParent = parseSafe(parent);
      if (!("ok" in parsedParent)) return { handled: false };
      const current = getValueAt(state, parsedParent.segs);
      if (!current.ok || !Array.isArray(current.value) || ops.length > current.value.length) {
        return { handled: false };
      }
      parentSegments = parsedParent.segs;
      currentArray = current.value;
      initialLength = current.value.length;
    } else if (parent !== location.parent) {
      return { handled: false };
    }

    if (location.index !== initialLength - index - 1) return { handled: false };
    applied[index] = { op: "remove", path: op.path };
  }

  if (parentSegments === null || currentArray === null) return { handled: false };
  const stateWithArray = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    currentArray.slice(0, initialLength - ops.length),
  );
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

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

    if (item.op === "copy") {
      if (item.fromIndex < 0 || item.fromIndex >= next.length) return { handled: false };
      const index = item.index === "-" ? next.length : item.index;
      if (index < 0 || index > next.length) return { handled: false };
      const value = cloneTrustedPlainJson(next[item.fromIndex]);
      if (index === next.length) next.push(value);
      else next.splice(index, 0, value);
      applied.push({ op: "copy", from: item.from, path: appendSegment(parent, index) });
      continue;
    }

    if (item.fromIndex < 0 || item.fromIndex >= next.length) return { handled: false };
    if (item.index === "-") {
      const [value] = next.splice(item.fromIndex, 1);
      const index = next.length;
      next.push(value);
      applied.push({ op: "move", from: item.from, path: appendSegment(parent, index) });
      continue;
    }

    const index = item.index;
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
  const value = cloneTrustedPlainJson(current[item.fromIndex]);
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, current.concat([value]));
  return stateWithArray === null
    ? { handled: false }
    : {
        handled: true,
        state: stateWithArray,
        applied: [{ op: "copy", from: item.from, path: appendSegment(parent, index) }],
      };
}

function applyIncreasingArrayAddOpsPatch(
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

function applyIncreasingArrayAddPatch(
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

function applyNonIncreasingArrayAddPatch(
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

function applyNonIncreasingArrayCopyPatch(
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

    const value = cloneTrustedPlainJson(current[item.fromIndex]);
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

function applyNonDecreasingArrayRemovePatch(
  state: unknown,
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

function applyAppendThenNonDecreasingRemovePatch(
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
