import type {
  JSONDocument,
  JSONDocumentDuplicateOptions,
  Pointer,
} from "zod-crud";

import {
  readCollectionItemLocation,
} from "./location.js";
import type {
  CollectionCapabilityResult,
  CollectionDuplicateOptions,
  CollectionDuplicateResult,
} from "./types.js";

export function canDuplicateAfter<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
  options?: CollectionDuplicateOptions,
): CollectionCapabilityResult {
  const location = readCollectionItemLocation(doc, pointer);
  return location.ok ? doc.canDuplicate(pointer, duplicateOptions(options)) : location;
}

export function duplicateAfter<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
  options?: CollectionDuplicateOptions,
): CollectionDuplicateResult<T> {
  const location = readCollectionItemLocation(doc, pointer);
  return location.ok ? doc.duplicate(pointer, duplicateOptions(options)) : location;
}

function duplicateOptions(options: CollectionDuplicateOptions | undefined): JSONDocumentDuplicateOptions | undefined {
  if (options?.rekey === undefined) return undefined;
  return { rekey: options.rekey };
}
