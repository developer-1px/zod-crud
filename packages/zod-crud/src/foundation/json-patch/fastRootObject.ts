import { jsonSerializableError } from "../jsonSerializable.js";
import {
  copyRootObject,
  copyRootObjectKeyPrefix,
  copyRootObjectKeys,
  objectHasOwn,
  removedRootKeysMatchSuffix,
} from "./object.js";
import { validateOperationShape } from "./apply.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

export function applyRootObjectRemovePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) {
    return { handled: false };
  }

  const source = state as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  let matchesSourceKeyOrder = ops.length === sourceKeys.length;
  let removedKeys: Record<string, true> | null = null;
  let matchesReverseSuffix = ops.length <= sourceKeys.length;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }

    const key = op.path.slice(1);
    if (matchesSourceKeyOrder && key === sourceKeys[index]) {
      matchesReverseSuffix = false;
      applied[index] = op;
      continue;
    }
    matchesSourceKeyOrder = false;
    if (matchesReverseSuffix && key === sourceKeys[sourceKeys.length - index - 1]) {
      applied[index] = op;
      continue;
    }
    matchesReverseSuffix = false;
    if (removedKeys === null) {
      removedKeys = Object.create(null) as Record<string, true>;
      for (let seenIndex = 0; seenIndex < index; seenIndex += 1) {
        removedKeys[ops[seenIndex]!.path.slice(1)] = true;
      }
    }
    if (!objectHasOwn.call(source, key) || objectHasOwn.call(removedKeys, key)) return { handled: false };
    removedKeys[key] = true;
    applied[index] = op;
  }

  if (ops.length === sourceKeys.length) return { handled: true, state: {}, applied };
  const keepCount = sourceKeys.length - ops.length;
  if (removedKeys === null || removedRootKeysMatchSuffix(sourceKeys, keepCount, removedKeys)) {
    return {
      handled: true,
      state: copyRootObjectKeyPrefix(source, sourceKeys, keepCount),
      applied,
    };
  }
  if (ops.length * 2 < sourceKeys.length) {
    const next = copyRootObjectKeys(source, sourceKeys);
    for (let index = 0; index < ops.length; index += 1) {
      delete next[ops[index]!.path.slice(1)];
    }
    return { handled: true, state: next, applied };
  }

  const next: Record<string, unknown> = {};
  for (const key of sourceKeys) {
    if (objectHasOwn.call(removedKeys, key)) continue;
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: source[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = source[key];
    }
  }

  return { handled: true, state: next, applied };
}

export function applyRootObjectAddPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) return { handled: false };

  let next: Record<string, unknown> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    const key = op.path.slice(1);
    if (next === null) next = copyRootObject(state as Record<string, unknown>);
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    applied[index] = op;
  }

  return next === null
    ? { handled: false }
    : { handled: true, state: next, applied };
}

export function applyRootObjectReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) return { handled: false };

  const source = state as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  let matchesSourceKeyOrder = ops.length === sourceKeys.length;
  const orderedNext: Record<string, unknown> | null = matchesSourceKeyOrder ? {} : null;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    const key = op.path.slice(1);
    if (matchesSourceKeyOrder) {
      if (key !== "" && key === sourceKeys[index]) {
        if (key === "__proto__") {
          Object.defineProperty(orderedNext, key, {
            value: op.value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        } else {
          orderedNext![key] = op.value;
        }
        applied[index] = op;
        continue;
      }
      matchesSourceKeyOrder = false;
    }

    if (key === "" || !objectHasOwn.call(state, key)) return { handled: false };
    applied[index] = op;
  }

  if (matchesSourceKeyOrder && orderedNext !== null) return { handled: true, state: orderedNext, applied };

  const next = copyRootObjectKeys(source, sourceKeys);
  const replaceOps = ops as ReadonlyArray<Extract<JSONPatchOperation, { op: "replace" }>>;
  for (let index = 0; index < replaceOps.length; index += 1) {
    const op = replaceOps[index]!;
    const key = op.path.slice(1);
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
  }
  return { handled: true, state: next, applied };
}
