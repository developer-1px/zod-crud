import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type CollectionErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_collection_item"
  | "move_boundary";

export interface CollectionError {
  ok: false;
  code: CollectionErrorCode;
  reason: string;
  pointer?: Pointer;
}

export type CollectionCapabilityResult =
  | { ok: true }
  | CollectionError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export type CollectionEditResult =
  | JSONResult
  | CollectionError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export type CollectionDuplicateResult<T> =
  | JSONDocumentDuplicateResult<T>
  | CollectionError;

export type CollectionSource = Pointer | ReadonlyArray<Pointer>;

export interface CollectionDuplicateOptions {
  rekey?: JSONDocumentDuplicateOptions["rekey"];
}

export interface Collection<T> {
  canMoveUp(pointer: Pointer): CollectionCapabilityResult;
  moveUp(pointer: Pointer): CollectionEditResult;
  canMoveDown(pointer: Pointer): CollectionCapabilityResult;
  moveDown(pointer: Pointer): CollectionEditResult;
  canMoveBefore(source: Pointer, target: Pointer): CollectionCapabilityResult;
  moveBefore(source: Pointer, target: Pointer): CollectionEditResult;
  canMoveAfter(source: Pointer, target: Pointer): CollectionCapabilityResult;
  moveAfter(source: Pointer, target: Pointer): CollectionEditResult;
  canDuplicateAfter(pointer: Pointer, options?: CollectionDuplicateOptions): CollectionCapabilityResult;
  duplicateAfter(pointer: Pointer, options?: CollectionDuplicateOptions): CollectionDuplicateResult<T>;
  canDeleteItems(source: CollectionSource): CollectionCapabilityResult;
  deleteItems(source: CollectionSource): CollectionEditResult;
}

interface CollectionItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  length: number;
}

type CollectionItemLocationResult =
  | { ok: true; location: CollectionItemLocation }
  | CollectionError;

type CollectionMovePlan =
  | { ok: true; from: Pointer; path: Pointer; noop: boolean }
  | CollectionError;

export function createCollection<T>(doc: JSONDocument<T>): Collection<T> {
  const canApplyMovePlan = (plan: CollectionMovePlan): CollectionCapabilityResult => {
    if (!plan.ok) return plan;
    return plan.noop ? { ok: true } : doc.canMove(plan.from, plan.path);
  };
  const checkedItems = (source: CollectionSource): NormalizedCollectionSource => {
    const normalized = normalizeCollectionSource(source);
    return normalized.ok ? ensureCollectionItems(doc, normalized.sources) : normalized;
  };

  return {
    canMoveUp: (pointer) => canApplyMovePlan(planMoveByOffset(doc, pointer, -1)),
    moveUp: (pointer) => applyMovePlan(doc, planMoveByOffset(doc, pointer, -1)),
    canMoveDown: (pointer) => canApplyMovePlan(planMoveByOffset(doc, pointer, 1)),
    moveDown: (pointer) => applyMovePlan(doc, planMoveByOffset(doc, pointer, 1)),
    canMoveBefore: (source, target) => canApplyMovePlan(planRelativeMove(doc, source, target, "before")),
    moveBefore: (source, target) => applyMovePlan(doc, planRelativeMove(doc, source, target, "before")),
    canMoveAfter: (source, target) => canApplyMovePlan(planRelativeMove(doc, source, target, "after")),
    moveAfter: (source, target) => applyMovePlan(doc, planRelativeMove(doc, source, target, "after")),
    canDuplicateAfter(pointer, options) {
      const location = readCollectionItemLocation(doc, pointer);
      return location.ok ? doc.canDuplicate(pointer, duplicateOptions(options)) : location;
    },
    duplicateAfter(pointer, options) {
      const location = readCollectionItemLocation(doc, pointer);
      return location.ok ? doc.duplicate(pointer, duplicateOptions(options)) : location;
    },
    canDeleteItems(source) {
      const checked = checkedItems(source);
      return checked.ok ? doc.canDelete(checked.sources) : checked;
    },
    deleteItems(source) {
      const checked = checkedItems(source);
      return checked.ok ? doc.delete(checked.sources) : checked;
    },
  };
}

function planMoveByOffset<T>(
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

function planRelativeMove<T>(
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

function applyMovePlan<T>(
  doc: JSONDocument<T>,
  plan: CollectionMovePlan,
): CollectionEditResult {
  if (!plan.ok) return plan;
  if (plan.noop) return { ok: true };
  return doc.move(plan.from, plan.path);
}

function readCollectionItemLocation<T>(
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

type NormalizedCollectionSource =
  | { ok: true; sources: Pointer[] }
  | CollectionError;

function normalizeCollectionSource(source: CollectionSource): NormalizedCollectionSource {
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

function ensureCollectionItems<T>(
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

function duplicateOptions(options: CollectionDuplicateOptions | undefined): JSONDocumentDuplicateOptions | undefined {
  if (options?.rekey === undefined) return undefined;
  return { rekey: options.rekey };
}

function collectionError(
  code: CollectionErrorCode,
  reason: string,
  pointer?: Pointer,
): CollectionError {
  const error: CollectionError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}
