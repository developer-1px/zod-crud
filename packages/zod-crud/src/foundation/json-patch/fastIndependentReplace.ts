import { jsonSerializableError } from "../jsonSerializable.js";
import type { Pointer } from "../json-pointer/pointerCore.js";
import { getValueAt, parseSafe } from "./internal.js";
import { validateOperationShape } from "./apply.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

interface ReplaceTree {
  value?: unknown;
  children: Map<string, ReplaceTree>;
}

export function applyIndependentReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  const items: Array<{ op: JSONPatchOperation; path: Pointer; segments: string[]; value: unknown }> = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") return { handled: false };
    const parsed = parseSafe(op.path);
    if (!("ok" in parsed)) return { handled: false };
    if (!getValueAt(state, parsed.segs).ok) return { handled: false };
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    items.push({ op, path: op.path, segments: parsed.segs, value: op.value });
  }

  if (!hasIndependentPaths(items)) return { handled: false };
  return { handled: true, state: applyReplaceTree(state, buildReplaceTree(items)), applied: items.map((item) => item.op) };
}

function buildReplaceTree(items: ReadonlyArray<{ segments: string[]; value: unknown }>): ReplaceTree {
  const root: ReplaceTree = { children: new Map() };
  for (const item of items) {
    let node = root;
    for (const segment of item.segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.value = item.value;
  }
  return root;
}

function applyReplaceTree(value: unknown, tree: ReplaceTree): unknown {
  if (tree.children.size === 0) return tree.value;
  if (Array.isArray(value)) {
    const next = value.slice();
    for (const [segment, child] of tree.children) {
      next[Number(segment)] = applyReplaceTree(next[Number(segment)], child);
    }
    return next;
  }
  const next = { ...(value as Record<string, unknown>) };
  for (const [segment, child] of tree.children) {
    next[segment] = applyReplaceTree(next[segment], child);
  }
  return next;
}

function hasIndependentPaths(paths: ReadonlyArray<{ path: string }>): boolean {
  const sorted = paths.map((item) => item.path).sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return false;
  }
  return true;
}
