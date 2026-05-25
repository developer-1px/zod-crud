import type { JSONPatchOperation } from "./types.js";
import { objectHasOwn } from "./object.js";

type SeenRootKeys = Record<string, true>;

export function computeRootObjectReplaceInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const seenKeys = createSeenRootKeys();
  let inverseCount = 0;
  const inverses = new Array<JSONPatchOperation | undefined>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (op.op === "test") continue;
    if (
      op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(state, key)) return null;
    if (seenKeys[key] === true) return null;
    seenKeys[key] = true;

    inverses[ops.length - index - 1] = {
      op: "replace",
      path: op.path,
      value: (state as Record<string, unknown>)[key],
    };
    inverseCount += 1;
  }

  if (inverseCount === 0) return null;
  if (inverseCount === inverses.length) return { ok: true, inverses: inverses as JSONPatchOperation[] };

  const compacted: JSONPatchOperation[] = [];
  for (const inverse of inverses) {
    if (inverse !== undefined) compacted.push(inverse);
  }
  return { ok: true, inverses: compacted };
}

export function computeRootObjectRemoveInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  const seenKeys = createSeenRootKeys();
  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (!objectHasOwn.call(state, key)) return null;
    if (seenKeys[key] === true) return null;
    seenKeys[key] = true;

    inverses[ops.length - index - 1] = {
      op: "add",
      path: op.path,
      value: (state as Record<string, unknown>)[key],
    };
  }

  return { ok: true, inverses };
}

export function computeRootObjectAddInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | null {
  if (
    ops.length < 2
    || state === null
    || typeof state !== "object"
    || Array.isArray(state)
  ) {
    return null;
  }

  let seenKeys: Set<string> | null = null;
  const source = state as Record<string, unknown>;
  const inverses = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return null;
    const op = ops[index]!;
    if (
      op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return null;
    }

    const key = op.path.slice(1);
    if (seenKeys === null) seenKeys = new Set();
    else if (seenKeys.has(key)) return null;
    seenKeys.add(key);

    inverses[ops.length - index - 1] = objectHasOwn.call(source, key)
      ? { op: "replace", path: op.path, value: source[key] }
      : { op: "remove", path: op.path };
  }

  return { ok: true, inverses };
}

function createSeenRootKeys(): SeenRootKeys {
  return Object.create(null) as SeenRootKeys;
}
