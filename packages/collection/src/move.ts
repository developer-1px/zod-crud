import {
  appendSegment,
  type JSONDocument,
  type Pointer,
} from "@interactive-os/json-document";

import {
  collectionError,
} from "./error.js";
import {
  readCollectionItemLocation,
} from "./location.js";
import type {
  CollectionCapabilityResult,
  CollectionEditResult,
  CollectionItemLocation,
  CollectionMovePlan,
} from "./types.js";

export function canApplyMovePlan<T>(
  doc: JSONDocument<T>,
  plan: CollectionMovePlan,
): CollectionCapabilityResult {
  if (!plan.ok) return plan;
  return plan.noop ? { ok: true } : doc.canMove(plan.from, plan.path);
}

export function planMoveByOffset<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
  offset: -1 | 1,
): CollectionMovePlan {
  const source = readCollectionItemLocation(doc, pointer);
  if (!source.ok) return source;

  const nextIndex = source.location.index + offset;
  if (nextIndex < 0 || nextIndex >= source.location.length) {
    return collectionError(
      "move_boundary",
      offset < 0 ? "item is already first" : "item is already last",
      pointer,
    );
  }

  const target: CollectionItemLocation = {
    ...source.location,
    pointer: appendSegment(source.location.parent, nextIndex),
    index: nextIndex,
  };
  return planRelativeMoveFromLocations(source.location, target, offset < 0 ? "before" : "after");
}

export function planRelativeMove<T>(
  doc: JSONDocument<T>,
  sourcePointer: Pointer,
  targetPointer: Pointer,
  position: "before" | "after",
): CollectionMovePlan {
  const source = readCollectionItemLocation(doc, sourcePointer);
  if (!source.ok) return source;

  const target = readCollectionItemLocation(doc, targetPointer);
  if (!target.ok) return target;

  return planRelativeMoveFromLocations(source.location, target.location, position);
}

export function applyMovePlan<T>(
  doc: JSONDocument<T>,
  plan: CollectionMovePlan,
): CollectionEditResult {
  if (!plan.ok) return plan;
  if (plan.noop) return { ok: true };
  return doc.move(plan.from, plan.path);
}

function planRelativeMoveFromLocations(
  source: CollectionItemLocation,
  target: CollectionItemLocation,
  position: "before" | "after",
): CollectionMovePlan {
  const sameParent = source.parent === target.parent;
  const insertionIndex = insertionIndexFor(source, target, position);
  const path = appendSegment(target.parent, insertionIndex);
  const noop = sameParent && (source.pointer === target.pointer || source.index === insertionIndex);

  return {
    ok: true,
    from: source.pointer,
    path,
    noop,
  };
}

function insertionIndexFor(
  source: CollectionItemLocation,
  target: CollectionItemLocation,
  position: "before" | "after",
): number {
  if (source.parent !== target.parent) {
    return position === "before" ? target.index : target.index + 1;
  }

  if (position === "before") {
    return source.index < target.index ? target.index - 1 : target.index;
  }
  return source.index < target.index ? target.index : target.index + 1;
}
