import { buildPointer, parentPointer, parsePointer, readAt } from "../json-pointer/index.js";
import type { JSONPatchOperation } from "./index.js";
import { getValueAt } from "./internal.js";

export const objectHasOwn = Object.prototype.hasOwnProperty;

export interface ArrayFieldPath {
  arrayPath: string;
  index: number;
  key: string;
}

export interface ArrayNestedPath {
  arraySegments: string[];
  index: number;
  prefixText: string;
  suffixText: string;
  suffixSegments: string[];
}

export interface ArrayFieldText {
  prefixText: string;
  suffixText: string;
}

export function arrayLocation(path: string): { parent: string; index: number | "-" } | null {
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
  return index === null ? null : { parent, index };
}

export function parseSimpleArrayElementPath(path: string): { parent: string; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1));
  return index === null
    ? null
    : { parent: path.slice(0, indexSlash), index };
}

export function parseFirstArrayNestedPath(state: unknown, path: string): ArrayNestedPath | null {
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch {
    return null;
  }
  if (segments.length < 3) return null;

  for (let segmentIndex = 0; segmentIndex < segments.length - 1; segmentIndex += 1) {
    const index = numericSegment(segments[segmentIndex]!);
    if (index === null) continue;

    const arraySegments = segments.slice(0, segmentIndex);
    const array = getValueAt(state, arraySegments);
    if (!array.ok || !Array.isArray(array.value)) continue;

    const arrayPath = buildPointer(arraySegments);
    const suffixSegments = segments.slice(segmentIndex + 1);
    return {
      arraySegments,
      index,
      prefixText: arrayPath === "" ? "/" : `${arrayPath}/`,
      suffixText: buildPointer(suffixSegments),
      suffixSegments,
    };
  }

  return null;
}

export function parseKnownArrayNestedIndex(path: string, location: ArrayNestedPath): number | null {
  if (
    !path.startsWith(location.prefixText)
    || !path.endsWith(location.suffixText)
  ) {
    return null;
  }

  const indexEnd = path.length - location.suffixText.length;
  const indexText = path.slice(location.prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
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

export function readValueAtPointer(
  state: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } {
  const simple = readSimplePointerValue(state, path);
  return simple ?? readAt(state, parsePointer(path));
}

function readSimplePointerValue(
  state: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false } | null {
  if (path === "") return { ok: true, value: state };
  if (path[0] !== "/" || path.includes("~")) return null;

  let current = state;
  let start = 1;
  while (true) {
    const nextSlash = path.indexOf("/", start);
    const segment = nextSlash === -1 ? path.slice(start) : path.slice(start, nextSlash);

    if (current === null || current === undefined) return { ok: false };
    if (Array.isArray(current)) {
      const index = numericSegment(segment);
      if (index === null || index >= current.length) return { ok: false };
      current = current[index];
    } else if (typeof current === "object") {
      if (!objectHasOwn.call(current, segment)) return { ok: false };
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { ok: false };
    }

    if (nextSlash === -1) return { ok: true, value: current };
    start = nextSlash + 1;
  }
}

export function parseArrayFieldPath(path: string): ArrayFieldPath | null {
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
  if (index === null) return null;
  const arrayPath = segments.length === 2
    ? ""
    : `/${segments.slice(0, -2).map(escapePointerSegment).join("/")}`;
  return { arrayPath, index, key: segments[segments.length - 1]! };
}

export function arrayFieldText(path: string): ArrayFieldText | null {
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

export function parseKnownArrayFieldIndex(path: string, text: ArrayFieldText): number | null {
  if (!path.startsWith(text.prefixText) || !path.endsWith(text.suffixText)) return null;
  const indexEnd = path.length - text.suffixText.length;
  const indexText = path.slice(text.prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

function parseSimpleArrayFieldPath(path: string): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  return index === null
    ? null
    : { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function seedSimpleArrayNestedReplaceIndexes(
  inverses: ReadonlyArray<JSONPatchOperation>,
  location: ArrayNestedPath,
): Set<number> {
  const seen = new Set<number>();
  for (const inverse of inverses) {
    const index = parseKnownArrayNestedIndex(inverse.path, location);
    if (index !== null) seen.add(index);
  }
  return seen;
}
