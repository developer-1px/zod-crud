import {
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONDocument,
  type Pointer,
} from "@interactive-os/json-document";

import {
  collectionError,
} from "./error.js";
import type {
  CollectionItemLocationResult,
  CollectionSource,
  NormalizedCollectionSource,
} from "./types.js";

export function readCollectionItemLocation<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): CollectionItemLocationResult {
  if (tryParsePointer(pointer) === null) {
    return collectionError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return collectionError("not_collection_item", "root is not a collection item", pointer);
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return collectionError("not_collection_item", `pointer does not address an array item: ${pointer}`, pointer);
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return collectionError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer);
  }
  if (!Array.isArray(parentRead.value)) {
    return collectionError("not_collection_item", `parent is not an array: ${parent}`, pointer);
  }
  if (index >= parentRead.value.length) {
    return collectionError("path_not_found", `item not found: ${pointer}`, pointer);
  }

  return {
    ok: true,
    location: {
      pointer,
      parent,
      index,
      length: parentRead.value.length,
    },
  };
}

export function normalizeCollectionSource(source: CollectionSource): NormalizedCollectionSource {
  const inputs = typeof source === "string" ? [source] : [...source];
  const sources: Pointer[] = [];
  for (const pointer of inputs) {
    if (tryParsePointer(pointer) === null) {
      return collectionError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
    }
    if (!sources.includes(pointer)) sources.push(pointer);
  }
  return sources.length > 0
    ? { ok: true, sources }
    : collectionError("empty_selection", "collection item selection is empty");
}

export function ensureCollectionItems<T>(
  doc: JSONDocument<T>,
  sources: ReadonlyArray<Pointer>,
): NormalizedCollectionSource {
  const checked: Pointer[] = [];
  for (const pointer of sources) {
    const location = readCollectionItemLocation(doc, pointer);
    if (!location.ok) return location;
    checked.push(pointer);
  }
  return { ok: true, sources: checked };
}
