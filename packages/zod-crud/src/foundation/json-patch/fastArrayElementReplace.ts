import { jsonSerializableError } from "../jsonSerializable.js";
import type { Pointer } from "../json-pointer/pointerCore.js";
import { getValueAt, parseSafe } from "./internal.js";
import { validateOperationShape } from "./apply.js";
import { arrayRemoveLocation } from "./path.js";
import { replaceValueAtSegments } from "./replaceValueAtSegments.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

export function applySameArrayElementReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  let next: unknown[] | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") return { handled: false };
    const location = arrayRemoveLocation(op.path);
    if (location === null) return { handled: false };
    if (parent === null) {
      parent = location.parent;
      const parsedParent = parseSafe(parent);
      if (!("ok" in parsedParent)) return { handled: false };
      parentSegments = parsedParent.segs;
      const current = getValueAt(state, parentSegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      next = current.value.slice();
    } else if (parent !== location.parent) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    if (next === null || location.index < 0 || location.index >= next.length) return { handled: false };
    next[location.index] = op.value;
    applied[index] = op;
  }

  if (parentSegments === null || next === null) return { handled: false };
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}
