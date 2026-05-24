import { jsonSerializableError } from "../json.js";
import type { Pointer } from "../json-pointer/index.js";
import { getValueAt, parseSafe } from "./internal.js";
import { appendArrayIndexPath, arrayRemoveLocation } from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

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
