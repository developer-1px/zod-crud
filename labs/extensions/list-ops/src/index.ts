import {
  appendSegment,
  parentPointer,
  lastSegmentIndex,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ListOpsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array_item"
  | "move_boundary";

export interface ListOpsError {
  ok: false;
  code: ListOpsErrorCode;
  reason: string;
  pointer?: Pointer;
}

export type ListOpsCapabilityResult =
  | { ok: true }
  | ListOpsError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export type ListOpsMoveResult =
  | JSONResult
  | ListOpsError
  | Exclude<JSONCapabilityResult, { ok: true }>;

export interface DuplicateAfterOptions {
  rekey?: JSONDocumentDuplicateOptions["rekey"];
}

export type ListOpsDuplicateResult<T> = JSONDocumentDuplicateResult<T> | ListOpsError;

export interface ListOps<T> {
  canMoveUp(pointer: Pointer): ListOpsCapabilityResult;
  moveUp(pointer: Pointer): ListOpsMoveResult;
  canMoveDown(pointer: Pointer): ListOpsCapabilityResult;
  moveDown(pointer: Pointer): ListOpsMoveResult;
  moveBefore(source: Pointer, target: Pointer): ListOpsMoveResult;
  moveAfter(source: Pointer, target: Pointer): ListOpsMoveResult;
  duplicateAfter(pointer: Pointer, options?: DuplicateAfterOptions): ListOpsDuplicateResult<T>;
}

interface ItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  length: number;
}

type ItemLocationResult = { ok: true; location: ItemLocation } | ListOpsError;

type MovePlan = { ok: true; from: Pointer; path: Pointer; noop: boolean } | ListOpsError;

export function createListOps<T>(doc: JSONDocument<T>): ListOps<T> {
  const canMoveUp = (pointer: Pointer): ListOpsCapabilityResult => {
    const plan = planMoveByOffset(doc, pointer, -1);
    if (!plan.ok) return plan;
    if (plan.noop) return { ok: true };
    return doc.canMove(plan.from, plan.path);
  };

  const moveUp = (pointer: Pointer): ListOpsMoveResult => {
    const plan = planMoveByOffset(doc, pointer, -1);
    if (!plan.ok) return plan;
    return applyMovePlan(doc, plan);
  };

  const canMoveDown = (pointer: Pointer): ListOpsCapabilityResult => {
    const plan = planMoveByOffset(doc, pointer, 1);
    if (!plan.ok) return plan;
    if (plan.noop) return { ok: true };
    return doc.canMove(plan.from, plan.path);
  };

  const moveDown = (pointer: Pointer): ListOpsMoveResult => {
    const plan = planMoveByOffset(doc, pointer, 1);
    if (!plan.ok) return plan;
    return applyMovePlan(doc, plan);
  };

  return {
    canMoveUp,
    moveUp,
    canMoveDown,
    moveDown,
    moveBefore(source, target) {
      const plan = planRelativeMove(doc, source, target, "before");
      if (!plan.ok) return plan;
      return applyMovePlan(doc, plan);
    },
    moveAfter(source, target) {
      const plan = planRelativeMove(doc, source, target, "after");
      if (!plan.ok) return plan;
      return applyMovePlan(doc, plan);
    },
    duplicateAfter(pointer, options) {
      const location = readItemLocation(doc, pointer);
      if (!location.ok) return location;

      const duplicateOptions: JSONDocumentDuplicateOptions = {};
      if (options?.rekey !== undefined) duplicateOptions.rekey = options.rekey;
      return doc.duplicate(pointer, duplicateOptions);
    },
  };
}

function planMoveByOffset<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
  offset: -1 | 1,
): MovePlan {
  const source = readItemLocation(doc, pointer);
  if (!source.ok) return source;

  const nextIndex = source.location.index + offset;
  if (nextIndex < 0 || nextIndex >= source.location.length) {
    return listOpsError(
      "move_boundary",
      offset < 0 ? "item is already first" : "item is already last",
      pointer,
    );
  }

  const target = {
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
): MovePlan {
  const source = readItemLocation(doc, sourcePointer);
  if (!source.ok) return source;

  const target = readItemLocation(doc, targetPointer);
  if (!target.ok) return target;

  return planRelativeMoveFromLocations(source.location, target.location, position);
}

function planRelativeMoveFromLocations(
  source: ItemLocation,
  target: ItemLocation,
  position: "before" | "after",
): MovePlan {
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
  source: ItemLocation,
  target: ItemLocation,
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
  plan: MovePlan,
): ListOpsMoveResult {
  if (!plan.ok) return plan;
  if (plan.noop) return { ok: true };
  return doc.move(plan.from, plan.path);
}

function readItemLocation<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): ItemLocationResult {
  if (tryParsePointer(pointer) === null) {
    return listOpsError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return listOpsError("not_array_item", "root is not a list item", pointer);
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return listOpsError("not_array_item", `pointer does not address an array item: ${pointer}`, pointer);
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return listOpsError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer);
  }
  if (!Array.isArray(parentRead.value)) {
    return listOpsError("not_array_item", `parent is not an array: ${parent}`, pointer);
  }
  if (index >= parentRead.value.length) {
    return listOpsError("path_not_found", `item not found: ${pointer}`, pointer);
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

function listOpsError(
  code: ListOpsErrorCode,
  reason: string,
  pointer?: Pointer,
): ListOpsError {
  const error: ListOpsError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}
