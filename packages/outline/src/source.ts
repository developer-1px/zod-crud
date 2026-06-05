import {
  lastSegmentIndex,
  parentPointer,
  parsePointer,
  tryParsePointer,
  type JSONDocument,
  type Pointer,
} from "zod-crud";

import {
  editError,
} from "./error.js";
import type {
  NormalizedStructureOptions,
  OutlineEditError,
  OutlineItemLocation,
  OutlineSource,
} from "./types.js";

export function validateSources<TDocument>(
  doc: JSONDocument<TDocument>,
  pointers: ReadonlyArray<Pointer>,
  options: NormalizedStructureOptions,
): { ok: true; pointers: ReadonlyArray<Pointer> } | OutlineEditError {
  for (const pointer of pointers) {
    const location = outlineItemLocation(pointer, options);
    if (!location.ok) return location;

    const read = doc.at(pointer);
    if (!read.ok) return editError(read.code, read.reason ?? `path not found: ${pointer}`, read.pointer);

    const parent = doc.at(location.parentArray);
    if (!parent.ok) return editError(parent.code, parent.reason ?? `parent not found: ${location.parentArray}`, parent.pointer);
    if (!Array.isArray(parent.value)) {
      return editError("not_outline_item", `parent is not an array: ${location.parentArray}`, pointer);
    }
  }
  return { ok: true, pointers };
}

export function normalizeSource(source: OutlineSource): { ok: true; pointers: ReadonlyArray<Pointer> } | OutlineEditError {
  const inputs = typeof source === "string" ? [source] : [...source];
  const pointers: Pointer[] = [];
  for (const pointer of inputs) {
    if (tryParsePointer(pointer) === null) {
      return editError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
    }
    if (!pointers.includes(pointer)) pointers.push(pointer);
  }

  if (pointers.length === 0) return editError("empty_selection", "outline source is empty");
  return {
    ok: true,
    pointers: pointers.sort(compareOutlinePointers),
  };
}

export function outlineItemLocation(
  pointer: Pointer,
  options: NormalizedStructureOptions,
): { ok: true; pointer: Pointer; parentArray: Pointer; index: number } | OutlineEditError {
  if (pointer === "") return editError("not_outline_item", "root is not an outline item", pointer);
  const parsed = tryParsePointer(pointer);
  if (parsed === null) return editError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);

  const index = lastSegmentIndex(pointer);
  const parentArray = parentPointer(pointer);
  if (index === null || parentArray === null || lastPointerSegment(parentArray) !== options.childrenKey) {
    return editError("not_outline_item", `pointer does not address an outline item: ${pointer}`, pointer);
  }
  return { ok: true, pointer, parentArray, index };
}

export function trailingUnselectedSiblingCount<TDocument>(
  doc: JSONDocument<TDocument>,
  location: OutlineItemLocation,
  selected: ReadonlySet<Pointer>,
): { ok: true; count: number } | OutlineEditError {
  const read = doc.at(location.parentArray);
  if (!read.ok) return editError(read.code, read.reason ?? `parent not found: ${location.parentArray}`, read.pointer);
  if (!Array.isArray(read.value)) {
    return editError("not_outline_item", `parent is not an array: ${location.parentArray}`, location.pointer);
  }
  if (selected.size <= 1) {
    return { ok: true, count: Math.max(0, read.value.length - location.index - 1) };
  }

  let count = 0;
  for (let index = location.index + 1; index < read.value.length; index += 1) {
    const pointer = `${location.parentArray}/${index}` as Pointer;
    if (selected.has(pointer)) break;
    count += 1;
  }
  return { ok: true, count };
}

function lastPointerSegment(pointer: Pointer): string | null {
  const segments = tryParsePointer(pointer);
  if (segments === null || segments.length === 0) return null;
  return segments[segments.length - 1] ?? null;
}

function compareOutlinePointers(left: Pointer, right: Pointer): number {
  const leftSegments = parsePointer(left);
  const rightSegments = parsePointer(right);
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftSegments[index]!;
    const rightSegment = rightSegments[index]!;
    if (leftSegment === rightSegment) continue;

    const leftNumber = decimalSegment(leftSegment);
    const rightNumber = decimalSegment(rightSegment);
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    return leftSegment.localeCompare(rightSegment);
  }
  return leftSegments.length - rightSegments.length;
}

function decimalSegment(segment: string): number | null {
  if (segment === "0") return 0;
  if (!/^[1-9][0-9]*$/.test(segment)) return null;
  return Number(segment);
}
