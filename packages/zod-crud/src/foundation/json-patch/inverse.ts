// computeInverses — undo 용 RFC 6902 inverse op 계산.

import type { JSONPatchOperation } from "./index.js";
import { applyOpRaw } from "./apply.js";
import { resolveAppendPath } from "./internal.js";
import {
  computeSameArrayElementReplaceInverses,
  computeSameArrayFieldReplaceInverses,
  computeSameArrayNestedReplaceInverses,
} from "./inverseArrayReplace.js";
import {
  computeAppendOnlyAddInverses,
  computeAppendThenNonDecreasingRemoveInverses,
  computeNonDecreasingArrayRemoveInverses,
  computeSameArrayStructuralInverses,
} from "./inverseArrayStructural.js";
import { readValueAtPointer } from "./inversePath.js";
import { computeIndependentReplaceInverses } from "./inverseReplace.js";
import {
  computeRootObjectAddInverses,
  computeRootObjectRemoveInverses,
  computeRootObjectReplaceInverses,
} from "./inverseRootObject.js";

function inverseOp(op: JSONPatchOperation, before: unknown): JSONPatchOperation | null {
  switch (op.op) {
    case "add":
    case "copy": {
      const path = resolveAppendPath(op.path, before);
      return { op: "remove", path };
    }
    case "remove": {
      const prev = readValueAtPointer(before, op.path);
      if (!prev.ok) return null;
      return { op: "add", path: op.path, value: prev.value };
    }
    case "replace": {
      if (op.path === "") return { op: "replace", path: "", value: before };
      const prev = readValueAtPointer(before, op.path);
      if (!prev.ok) return null;
      return { op: "replace", path: op.path, value: prev.value };
    }
    case "move": {
      const path = resolveAppendPath(op.path, before);
      return { op: "move", from: path, path: op.from };
    }
    case "test": return null;
  }
}

export function computeInverses(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): { ok: true; inverses: JSONPatchOperation[] } | { ok: false } {
  if (ops.length === 1 && 0 in ops) return computeSingleInverse(state, ops[0]!);
  const appendOnly = computeAppendOnlyAddInverses(state, ops);
  if (appendOnly) return appendOnly;
  const arrayFieldReplace = computeSameArrayFieldReplaceInverses(state, ops);
  if (arrayFieldReplace) return arrayFieldReplace;
  const arrayElementReplace = computeSameArrayElementReplaceInverses(state, ops);
  if (arrayElementReplace) return arrayElementReplace;
  const rootObjectReplace = computeRootObjectReplaceInverses(state, ops);
  if (rootObjectReplace) return rootObjectReplace;
  const rootObjectRemove = computeRootObjectRemoveInverses(state, ops);
  if (rootObjectRemove) return rootObjectRemove;
  const rootObjectAdd = computeRootObjectAddInverses(state, ops);
  if (rootObjectAdd) return rootObjectAdd;
  const arrayRemoveOnly = computeNonDecreasingArrayRemoveInverses(state, ops);
  if (arrayRemoveOnly) return arrayRemoveOnly;
  const appendThenRemove = computeAppendThenNonDecreasingRemoveInverses(state, ops);
  if (appendThenRemove) return appendThenRemove;
  const arrayNestedReplace = computeSameArrayNestedReplaceInverses(state, ops);
  if (arrayNestedReplace) return arrayNestedReplace;
  const replaceOnly = computeIndependentReplaceInverses(state, ops);
  if (replaceOnly) return replaceOnly;
  const arrayOnly = computeSameArrayStructuralInverses(state, ops);
  if (arrayOnly) return arrayOnly;

  const out: JSONPatchOperation[] = [];
  let cur: unknown = state;
  for (const op of ops) {
    const inv = inverseOp(op, cur);
    const r = applyOpRaw(cur, op);
    if ("error" in r) return { ok: false };
    if (inv) out.push(inv);
    cur = r.state;
  }
  return { ok: true, inverses: out.reverse() };
}

function computeSingleInverse(
  state: unknown,
  op: JSONPatchOperation,
): { ok: true; inverses: JSONPatchOperation[] } | { ok: false } {
  const inverse = inverseOp(op, state);
  if (inverse === null) return op.op === "test" ? { ok: true, inverses: [] } : { ok: false };
  return { ok: true, inverses: [inverse] };
}
