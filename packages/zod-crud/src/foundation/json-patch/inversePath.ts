import { parsePointer, readAt } from "../json-pointer/pointerCore.js";
import type { JSONPatchOperation } from "./types.js";
import type { ArrayNestedPath } from "./types.js";
import { objectHasOwn } from "./object.js";
import {
  numericSegment,
  parseKnownArrayNestedIndex,
} from "./path.js";

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

export function seedSimpleArrayNestedReplaceIndexes(
  inverses: ReadonlyArray<JSONPatchOperation>,
  location: ArrayNestedPath,
): Set<number> {
  const seen = new Set<number>();
  for (const inverse of inverses) {
    const index = parseKnownArrayNestedIndex(
      inverse.path,
      location.arrayPath,
      location.suffixSegments,
      location.prefixText,
      location.suffixText,
    );
    if (index !== null) seen.add(index);
  }
  return seen;
}
