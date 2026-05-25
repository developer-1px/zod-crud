import { buildPointer, parentPointer, type Pointer } from "../pointer/index.js";
import { getValueAt, parseSafe } from "./container.js";
import type { ArrayFieldPath, ArrayFieldText, ArrayNestedPath } from "./types.js";

export function arrayLocation(path: Pointer): { parent: Pointer; index: number | "-" } | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  const parsed = parseSafe(path);
  if (!("ok" in parsed)) return null;
  const segment = parsed.segs[parsed.segs.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent, index };
}

export function arrayRemoveLocation(path: Pointer): { parent: Pointer; index: number } | null {
  const simple = parseSimpleArrayElementPath(path);
  if (simple !== null) return simple;

  const location = arrayLocation(path);
  return location === null || location.index === "-"
    ? null
    : { parent: location.parent, index: location.index };
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

export function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < 2) return null;
  const key = parsed.segs[parsed.segs.length - 1]!;
  const index = numericSegment(parsed.segs[parsed.segs.length - 2]!);
  return index === null
    ? null
    : { arrayPath: buildPointer(parsed.segs.slice(0, -2)), index, key };
}

export function arrayFieldText(path: Pointer): ArrayFieldText | null {
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  return indexSlash < 0
    ? null
    : {
        prefixText: path.slice(0, indexSlash + 1),
        suffixText: path.slice(keySlash),
      };
}

export function parseKnownArrayFieldIndex(path: Pointer, text: ArrayFieldText): number | null {
  if (!path.startsWith(text.prefixText) || !path.endsWith(text.suffixText)) return null;
  const indexEnd = path.length - text.suffixText.length;
  const indexText = path.slice(text.prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

export function parseFirstArrayNestedPath(state: unknown, path: Pointer): ArrayNestedPath | null {
  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < 3) return null;

  for (let index = 0; index < parsed.segs.length - 1; index += 1) {
    const rowIndex = numericSegment(parsed.segs[index]!);
    if (rowIndex === null) continue;

    const arraySegments = parsed.segs.slice(0, index);
    const current = getValueAt(state, arraySegments);
    if (!current.ok || !Array.isArray(current.value)) continue;

    const arrayPath = buildPointer(arraySegments);
    const suffixSegments = parsed.segs.slice(index + 1);
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

  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < suffixSegments.length + 2) return null;

  const arraySegmentsLength = parsed.segs.length - suffixSegments.length - 1;
  for (let index = 0; index < suffixSegments.length; index += 1) {
    if (parsed.segs[arraySegmentsLength + 1 + index] !== suffixSegments[index]) return null;
  }

  const arraySegments = parsed.segs.slice(0, arraySegmentsLength);
  if (buildPointer(arraySegments) !== arrayPath) return null;

  return numericSegment(parsed.segs[arraySegmentsLength]!);
}

function arrayNestedPrefixText(arrayPath: Pointer): string {
  return arrayPath === "" ? "/" : `${arrayPath}/`;
}

function parseKnownArrayNestedIndexText(
  path: Pointer,
  prefixText: string,
  suffixText: string,
): number | null {
  if (!path.startsWith(prefixText) || !path.endsWith(suffixText)) return null;
  const indexEnd = path.length - suffixText.length;
  const indexText = path.slice(prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  if (index === null) return null;

  return { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function parseSimpleArrayElementPath(path: Pointer): { parent: Pointer; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1));
  return index === null
    ? null
    : { parent: path.slice(0, indexSlash), index };
}
