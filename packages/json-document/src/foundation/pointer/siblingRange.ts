// Sibling-range normalization — pure path arithmetic over JSON Pointers.
// 정본: docs/standard/contract-pressure-register.md "sibling-range 정규화" (RFC #87).
//
// Several editing features (group/ungroup, wrap/unwrap, layer reorder, block
// move, fill/series) all turn a set of selected sibling item pointers into a
// shared parent + a sorted, optionally-contiguous index run. This helper is the
// product-neutral, state-free core of that step. It does NOT read the document:
// callers still validate that the parent is an array via `doc.at` as needed.

import {
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type Pointer,
} from "./index.js";

export type SiblingRangeErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "not_array_item"
  | "mixed_parent"
  | "non_contiguous";

export interface SiblingLocation {
  /** The input pointer. */
  pointer: Pointer;
  /** Parent array pointer shared by the whole range. */
  parent: Pointer;
  /** Array index of this item. */
  index: number;
}

export type SiblingRangeResult =
  | {
      ok: true;
      /** Parent array pointer shared by every location. */
      parent: Pointer;
      /** Locations sorted by ascending index. */
      locations: ReadonlyArray<SiblingLocation>;
      /** Whether the sorted indices form a gap-free run. */
      contiguous: boolean;
    }
  | { ok: false; code: SiblingRangeErrorCode; reason: string; pointer?: Pointer };

export interface ResolveSiblingRangeOptions {
  /** Drop duplicate pointers before resolving. Default `true`. */
  dedupe?: boolean;
  /** Drop pointers that are descendants of another selected pointer. Default `false`. */
  pruneDescendants?: boolean;
  /** Fail with `non_contiguous` when the indices have gaps. Default `false`. */
  requireContiguous?: boolean;
}

/**
 * Resolve selected sibling item pointers into a shared parent + sorted index run.
 * Pure: no document or schema access. Callers verify the parent is an array.
 */
export function resolveSiblingRange(
  source: Pointer | ReadonlyArray<Pointer>,
  options: ResolveSiblingRangeOptions = {},
): SiblingRangeResult {
  let pointers = Array.isArray(source) ? [...source] : [source as Pointer];
  if (options.dedupe !== false) pointers = [...new Set(pointers)];
  if (options.pruneDescendants) pointers = pruneDescendants(pointers);
  if (pointers.length === 0) {
    return fail("empty_selection", "sibling range selection is empty.");
  }

  let parent: Pointer | null = null;
  const locations: SiblingLocation[] = [];
  for (const pointer of pointers) {
    if (tryParsePointer(pointer) === null) {
      return fail("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
    }
    const itemParent = parentPointer(pointer);
    const index = lastSegmentIndex(pointer);
    if (itemParent === null || index === null) {
      return fail("not_array_item", `pointer does not address an array item: ${pointer}`, pointer);
    }
    if (parent === null) {
      parent = itemParent;
    } else if (parent !== itemParent) {
      return fail("mixed_parent", `selection must share one parent array: ${parent} vs ${itemParent}`, pointer);
    }
    locations.push({ pointer, parent: itemParent, index });
  }

  locations.sort((left, right) => left.index - right.index);
  const start = (locations[0] as SiblingLocation).index;
  const contiguous = locations.every((location, offset) => location.index === start + offset);
  if (options.requireContiguous && !contiguous) {
    return fail(
      "non_contiguous",
      `selection must be a contiguous index range; got ${locations.map((location) => location.index).join(", ")}`,
      (locations[0] as SiblingLocation).pointer,
    );
  }

  return { ok: true, parent: parent as Pointer, locations, contiguous };
}

function pruneDescendants(pointers: ReadonlyArray<Pointer>): Pointer[] {
  return pointers.filter(
    (pointer) => !pointers.some((candidate) => candidate !== pointer && isDescendantOf(pointer, candidate)),
  );
}

function isDescendantOf(pointer: Pointer, ancestor: Pointer): boolean {
  const childSegments = tryParsePointer(pointer);
  const ancestorSegments = tryParsePointer(ancestor);
  if (childSegments === null || ancestorSegments === null) return false;
  if (ancestorSegments.length >= childSegments.length) return false;
  for (let index = 0; index < ancestorSegments.length; index += 1) {
    if (ancestorSegments[index] !== childSegments[index]) return false;
  }
  return true;
}

function fail(code: SiblingRangeErrorCode, reason: string, pointer?: Pointer): SiblingRangeResult {
  return pointer === undefined ? { ok: false, code, reason } : { ok: false, code, reason, pointer };
}
