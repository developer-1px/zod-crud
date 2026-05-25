import {
  buildPointer,
  parentPointer,
  parsePointer,
  readAt,
  type Pointer,
} from "../../foundation/json-pointer/pointerCore.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import { validateOperationShape } from "../../foundation/json-patch/apply.js";
import { objectHasOwn, replaceObjectDataValue } from "./localSchemaObject.js";

export interface ArrayFieldPath {
  arrayPath: Pointer;
  index: number;
  key: string;
}

export interface ArrayFieldText {
  prefixText: string;
  suffixText: string;
}

export interface ArrayNestedPath {
  arrayPath: Pointer;
  arraySegments: string[];
  index: number;
  prefixText: string;
  suffixText: string;
  suffixSegments: string[];
}

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

export function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 2) return null;
  const index = numericSegment(segments[segments.length - 2]!);
  return index === null
    ? null
    : { arrayPath: buildPointer(segments.slice(0, -2)), index, key: segments[segments.length - 1]! };
}

export function arrayFieldText(path: Pointer): ArrayFieldText | null {
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  return indexSlash < 0
    ? null
    : { prefixText: path.slice(0, indexSlash + 1), suffixText: path.slice(keySlash) };
}

export function parseKnownArrayFieldIndex(path: Pointer, text: ArrayFieldText): number | null {
  if (!path.startsWith(text.prefixText) || !path.endsWith(text.suffixText)) return null;
  const indexEnd = path.length - text.suffixText.length;
  const indexText = path.slice(text.prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

export function readFirstArrayNestedPath(state: unknown, path: Pointer): ArrayNestedPath | null {
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 3) return null;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const rowIndex = numericSegment(segments[index]!);
    if (rowIndex === null) continue;
    const arraySegments = segments.slice(0, index);
    const current = readArrayAtSegments(state, arraySegments);
    if (!current.ok) continue;
    const arrayPath = buildPointer(arraySegments);
    const suffixSegments = segments.slice(index + 1);
    return {
      arrayPath,
      arraySegments,
      index: rowIndex,
      prefixText: arrayNestedPrefixText(arrayPath),
      suffixText: buildPointer(suffixSegments),
      suffixSegments,
    };
  }

  return null;
}

export function parseKnownArrayNestedIndex(
  path: Pointer,
  arrayPath: Pointer,
  suffixSegments: string[],
  prefixText: string,
  suffixText: string,
): number | null {
  const knownIndex = parseKnownArrayNestedIndexText(path, prefixText, suffixText);
  if (knownIndex !== null) return knownIndex;

  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < suffixSegments.length + 2) return null;

  const arraySegmentsLength = segments.length - suffixSegments.length - 1;
  for (let index = 0; index < suffixSegments.length; index += 1) {
    if (segments[arraySegmentsLength + 1 + index] !== suffixSegments[index]) return null;
  }
  const arraySegments = segments.slice(0, arraySegmentsLength);
  if (buildPointer(arraySegments) !== arrayPath) return null;
  return numericSegment(segments[arraySegmentsLength]!);
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

export function replaceValueAtSegments(
  current: unknown,
  segments: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown | null {
  if (index === segments.length) return value;
  if (current === null || typeof current !== "object") return null;

  const segment = segments[index]!;
  if (Array.isArray(current)) {
    const childIndex = numericSegment(segment);
    if (childIndex === null || childIndex >= current.length) return null;
    const child = replaceValueAtSegments(current[childIndex], segments, index + 1, value);
    if (child === null) return null;
    const next = current.slice();
    next[childIndex] = child;
    return next;
  }

  if (!objectHasOwn.call(current, segment)) return null;
  const child = replaceValueAtSegments((current as Record<string, unknown>)[segment], segments, index + 1, value);
  return child === null ? null : replaceObjectDataValue(current, segment, child);
}

export function numericSegment(segment: string): number | null {
  if (segment.length === 0) return null;
  const first = segment.charCodeAt(0);
  if (first === 48) return segment.length === 1 ? 0 : null;
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(segment);
}

export function appendArrayIndexPath(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

export function indexDirection(previous: number, current: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
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

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;
  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  return index === null ? null : { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function arrayNestedPrefixText(arrayPath: Pointer): string {
  return arrayPath === "" ? "/" : `${arrayPath}/`;
}

function parseKnownArrayNestedIndexText(path: Pointer, prefixText: string, suffixText: string): number | null {
  if (!path.startsWith(prefixText) || !path.endsWith(suffixText)) return null;
  const indexEnd = path.length - suffixText.length;
  const indexText = path.slice(prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}
