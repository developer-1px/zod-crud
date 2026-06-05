import type {
  JSONDocument,
} from "zod-crud";

import {
  ensureCollectionItems,
  normalizeCollectionSource,
} from "./location.js";
import type {
  CollectionCapabilityResult,
  CollectionEditResult,
  CollectionSource,
  NormalizedCollectionSource,
} from "./types.js";

export function checkedItems<T>(
  doc: JSONDocument<T>,
  source: CollectionSource,
): NormalizedCollectionSource {
  const normalized = normalizeCollectionSource(source);
  return normalized.ok ? ensureCollectionItems(doc, normalized.sources) : normalized;
}

export function canDeleteItems<T>(
  doc: JSONDocument<T>,
  source: CollectionSource,
): CollectionCapabilityResult {
  const checked = checkedItems(doc, source);
  return checked.ok ? doc.canDelete(checked.sources) : checked;
}

export function deleteItems<T>(
  doc: JSONDocument<T>,
  source: CollectionSource,
): CollectionEditResult {
  const checked = checkedItems(doc, source);
  return checked.ok ? doc.delete(checked.sources) : checked;
}
