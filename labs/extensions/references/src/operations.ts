import type { JSONDocument } from "@interactive-os/json-document";
import { buildIndex, copyTarget, referenceError, referenceKey } from "./plan.js";
import type { ReferenceResolveResult, ReferencesDescriptor, ReferenceSnapshot } from "./types.js";

export function indexReferences<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
): ReferenceSnapshot {
  return buildIndex(doc, descriptor).snapshot;
}

export function resolveReference<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
  target: string,
  id: string,
): ReferenceResolveResult {
  const bucket = buildIndex(doc, descriptor).buckets.get(referenceKey(target, id)) ?? [];
  if (bucket.length === 0) {
    return referenceError("target_not_found", `reference target not found: ${target}:${id}`, { target, id });
  }
  if (bucket.length > 1) {
    return referenceError("ambiguous_target_id", `reference target is ambiguous: ${target}:${id}`, {
      target,
      id,
      pointers: bucket.map((entry) => entry.pointer),
    });
  }
  return { ok: true, target: copyTarget(bucket[0]!) };
}
