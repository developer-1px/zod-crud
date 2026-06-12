import {
  appendSegment,
  parentPointer,
  trackPointer,
  withLastSegment,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "@interactive-os/json-document";

import {
  copyChange,
} from "./copy.js";
import {
  editError,
} from "./error.js";
import {
  normalizeStructureOptions,
} from "./options.js";
import {
  normalizeSource,
  outlineItemLocation,
  trailingUnselectedSiblingCount,
  validateSources,
} from "./source.js";
import type {
  NormalizedStructureOptions,
  OutlineEditChange,
  OutlineEditChangeResult,
  OutlineEditResult,
  OutlineSource,
  OutlineStructureOptions,
} from "./types.js";

export function canDemoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditChangeResult {
  const plan = planDemote(doc, source, normalizeStructureOptions(options));
  if (!plan.ok) return plan;
  return changeWithCapability(doc, plan);
}

export function demoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditResult {
  const change = canDemoteOutline(doc, source, options);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

export function canPromoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditChangeResult {
  const plan = planPromote(doc, source, normalizeStructureOptions(options));
  if (!plan.ok) return plan;
  return changeWithCapability(doc, plan);
}

export function promoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditResult {
  const change = canPromoteOutline(doc, source, options);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

function planDemote<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: NormalizedStructureOptions,
): OutlineEditChangeResult {
  const pointers = normalizeSource(source);
  if (!pointers.ok) return pointers;

  const checked = validateSources(doc, pointers.pointers, options);
  if (!checked.ok) return checked;

  const operations: JSONPatchOperation[] = [];
  for (const original of checked.pointers) {
    const current = trackPointer(original, operations);
    if (current === null) continue;

    const location = outlineItemLocation(current, options);
    if (!location.ok) return location;
    if (location.index === 0) {
      return editError("path_not_found", "no previous sibling for outline item", current);
    }

    const previousSibling = withLastSegment(current, location.index - 1);
    if (previousSibling === null) {
      return editError("path_not_found", "no previous sibling for outline item", current);
    }

    operations.push({
      op: "move",
      from: current,
      path: appendSegment(appendSegment(previousSibling, options.childrenKey), "-"),
    });
  }

  return {
    ok: true,
    operation: "demote",
    source: checked.pointers,
    operations,
  };
}

function planPromote<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: NormalizedStructureOptions,
): OutlineEditChangeResult {
  const pointers = normalizeSource(source);
  if (!pointers.ok) return pointers;

  const checked = validateSources(doc, pointers.pointers, options);
  if (!checked.ok) return checked;

  const operations: JSONPatchOperation[] = [];
  const selected = new Set<Pointer>(checked.pointers);
  const promotedAfterOwner = new Map<Pointer, number>();
  for (const original of checked.pointers) {
    const originalLocation = outlineItemLocation(original, options);
    if (!originalLocation.ok) return originalLocation;

    const originalOwner = parentPointer(originalLocation.parentArray);
    if (originalOwner === null || originalOwner === "") {
      return editError("path_not_found", "outline item is already top-level", original);
    }

    const current = trackPointer(original, operations);
    if (current === null) continue;

    const location = outlineItemLocation(current, options);
    if (!location.ok) return location;

    const owner = parentPointer(location.parentArray);
    if (owner === null || owner === "") {
      return editError("path_not_found", "outline item is already top-level", current);
    }

    const ownerLocation = outlineItemLocation(owner, options);
    if (!ownerLocation.ok) return ownerLocation;

    const ownerParent = ownerLocation.parentArray;
    const previousPromoted = promotedAfterOwner.get(originalOwner) ?? 0;
    const promotedPath = appendSegment(ownerParent, ownerLocation.index + 1 + previousPromoted);
    operations.push({ op: "move", from: current, path: promotedPath });
    promotedAfterOwner.set(originalOwner, previousPromoted + 1);

    const trailCount = trailingUnselectedSiblingCount(doc, originalLocation, selected);
    if (!trailCount.ok) return trailCount;

    for (let index = 0; index < trailCount.count; index += 1) {
      operations.push({
        op: "move",
        from: appendSegment(location.parentArray, location.index),
        path: appendSegment(appendSegment(promotedPath, options.childrenKey), "-"),
      });
    }
  }

  return {
    ok: true,
    operation: "promote",
    source: checked.pointers,
    operations,
  };
}

function changeWithCapability<TDocument>(
  doc: JSONDocument<TDocument>,
  change: OutlineEditChange,
): OutlineEditChangeResult {
  if (change.operations.length > 0) {
    const capability = doc.canPatch(change.operations);
    if (!capability.ok) {
      return { ...editError("patch_rejected", capability.reason ?? "outline patch rejected", capability.pointer), capability };
    }
  }
  return copyChange(change);
}

function applyChange<TDocument>(
  doc: JSONDocument<TDocument>,
  change: OutlineEditChange,
): OutlineEditResult {
  const result: JSONResult = change.operations.length === 0
    ? { ok: true }
    : doc.patch(change.operations);
  if (!result.ok) return { ...editError("patch_failed", result.reason ?? "outline patch failed", result.pointer), result };

  return {
    ...copyChange(change),
    result,
  };
}
