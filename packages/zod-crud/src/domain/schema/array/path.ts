import {
  parentPointer,
  parsePointer,
  readAt,
  type Pointer,
} from "../../../foundation/pointer/index.js";
import type { JSONPatchOperation } from "../../../foundation/patch/types.js";
import { validateOperationShape } from "../../../foundation/patch/apply.js";
import { numericSegment } from "../../../foundation/patch/path.js";

export type AppliedLocalOpSourceValue = { ok: true; value: unknown } | { ok: false };

export function arrayIndexInParent(path: Pointer, parent: Pointer): { index: number | "-" } | null {
  const simple = parseSimpleArrayIndexPath(path);
  if (simple !== null) return simple.parent === parent ? { index: simple.index } : null;

  if (parentPointer(path) !== parent) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { index };
}

export function arrayIndexPathLocation(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number | "-" } | null {
  const simple = parseSimpleArrayIndexPath(path);
  if (simple !== null) {
    return {
      parent: simple.parent,
      parentSegments: simple.parent === "" ? [] : simple.parent.slice(1).split("/"),
      index: simple.index,
    };
  }

  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent, parentSegments: segments.slice(0, -1), index };
}

export function arrayElementReplaceLocation(
  path: Pointer,
): { parent: Pointer; parentSegments: string[]; index: number } | null {
  const simple = parseSimpleArrayElementReplacePath(path);
  if (simple !== null) return simple;

  const parent = parentPointer(path);
  if (parent === null) return null;
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = numericSegment(segment);
  return index === null ? null : { parent, parentSegments: segments.slice(0, -1), index };
}

export function arrayElementIndexPrefix(parent: Pointer): string {
  return parent === "" ? "/" : `${parent}/`;
}

export function parseKnownArrayElementReplaceIndex(path: Pointer, prefix: string): number | null {
  if (!path.startsWith(prefix)) return null;
  const indexText = path.slice(prefix.length);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

export function planIndependentReplacePaths(operations: ReadonlyArray<JSONPatchOperation>): Pointer[] | null {
  if (!Array.isArray(operations) || operations.length === 0) return null;
  const paths = new Array<Pointer>(operations.length);

  for (let index = 0; index < operations.length; index++) {
    if (!(index in operations)) return null;
    const op = operations[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || typeof op.path !== "string" || op.path === "") return null;
    try {
      const segments = parsePointer(op.path);
      if (segments.includes("-")) return null;
    } catch {
      return null;
    }
    paths[index] = op.path;
  }

  return paths;
}

export function haveIndependentReplacePaths(paths: ReadonlyArray<Pointer>): boolean {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  const sorted = [...paths].sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return false;
  }
  return true;
}

export function readArrayAtSegments(
  state: unknown,
  segments: ReadonlyArray<string>,
): { ok: true; array: ReadonlyArray<unknown> } | { ok: false } {
  const current = readAt(state, segments);
  return current.ok && Array.isArray(current.value) ? { ok: true, array: current.value } : { ok: false };
}

export function readAppliedLocalOpSourceValue(state: unknown, operation: JSONPatchOperation): AppliedLocalOpSourceValue {
  if (operation.op !== "copy" && operation.op !== "move") return { ok: false };
  try {
    return readAt(state, parsePointer(operation.from));
  } catch {
    return { ok: false };
  }
}

function parseSimpleArrayIndexPath(path: Pointer): { parent: Pointer; index: number | "-" } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;
  const segment = path.slice(indexSlash + 1);
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent: path.slice(0, indexSlash), index };
}

function parseSimpleArrayElementReplacePath(path: Pointer): { parent: Pointer; parentSegments: string[]; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;
  const index = numericSegment(path.slice(indexSlash + 1));
  if (index === null) return null;
  const parent = path.slice(0, indexSlash);
  return { parent, parentSegments: parent === "" ? [] : parent.slice(1).split("/"), index };
}
