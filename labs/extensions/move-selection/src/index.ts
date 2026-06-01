import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type MoveSelectionErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "not_array_item"
  | "mixed_parent"
  | "not_contiguous"
  | "path_not_found"
  | "not_array"
  | "target_parent_mismatch"
  | "target_in_selection"
  | "patch_rejected"
  | "patch_failed";

export interface MoveSelectionError {
  ok: false;
  code: MoveSelectionErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Move the selected block to just before or just after a reference sibling. */
export type MoveSelectionTarget =
  | { before: Pointer }
  | { after: Pointer };

export interface MoveSelectionChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  count: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers of the moved block at its new position, in order. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type MoveSelectionResult = MoveSelectionChange | MoveSelectionError;

export interface MoveSelection<TDocument> {
  canMoveSelection(source: ReadonlyArray<Pointer>, target: MoveSelectionTarget): MoveSelectionResult;
  moveSelection(source: ReadonlyArray<Pointer>, target: MoveSelectionTarget): MoveSelectionResult;
}

export function createMoveSelection<TDocument>(
  doc: JSONDocument<TDocument>,
): MoveSelection<TDocument> {
  return {
    canMoveSelection(source, target) {
      return canMoveSelection(doc, source, target);
    },
    moveSelection(source, target) {
      return moveSelection(doc, source, target);
    },
  };
}

export function canMoveSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  source: ReadonlyArray<Pointer>,
  target: MoveSelectionTarget,
): MoveSelectionResult {
  const range = normalizeRange(source);
  if (!range.ok) return range;

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return error(parentRead.code, parentRead.reason ?? `parent not found: ${range.parent}`, range.parent);
  }
  if (!Array.isArray(parentRead.value)) {
    return error("not_array", `selection parent is not an array: ${range.parent}`, range.parent);
  }
  const items = parentRead.value as unknown[];

  const side = "before" in target ? "before" : "after";
  const targetPointer = "before" in target ? target.before : target.after;
  if (tryParsePointer(targetPointer) === null) {
    return error("invalid_pointer", `invalid target pointer: ${targetPointer}`, targetPointer);
  }
  const targetIndex = lastSegmentIndex(targetPointer);
  const targetParent = parentPointer(targetPointer);
  if (targetIndex === null || targetParent === null) {
    return error("not_array_item", `target is not an array item: ${targetPointer}`, targetPointer);
  }
  if (targetParent !== range.parent) {
    return error("target_parent_mismatch", `target must share the selection parent array: ${range.parent}`, targetPointer);
  }
  const blockStart = range.indices[0] as number;
  const blockEnd = range.indices[range.indices.length - 1] as number;
  if (targetIndex >= blockStart && targetIndex <= blockEnd) {
    return error("target_in_selection", "target must be outside the moved selection", targetPointer);
  }

  const blockSet = new Set(range.indices);
  const block = range.indices.map((index) => items[index]);
  const rest: unknown[] = [];
  let referencePositionInRest = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (blockSet.has(index)) continue;
    if (index === targetIndex) referencePositionInRest = rest.length;
    rest.push(items[index]);
  }

  const insertAt = side === "before" ? referencePositionInRest : referencePositionInRest + 1;
  const nextItems = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];

  const changed = !jsonEqual(items, nextItems);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: range.parent, value: cloneJson(nextItems) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(range.parent, capability);
  }

  const selectionAfter: Pointer[] = [];
  for (let offset = 0; offset < block.length; offset += 1) {
    selectionAfter.push(appendSegment(range.parent, insertAt + offset));
  }

  return {
    ok: true,
    path: range.parent,
    count: block.length,
    changed,
    operations,
    selectionAfter,
  };
}

export function moveSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  source: ReadonlyArray<Pointer>,
  target: MoveSelectionTarget,
): MoveSelectionResult {
  const change = canMoveSelection(doc, source, target);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

interface NormalizedRange {
  ok: true;
  parent: Pointer;
  indices: number[];
}

function normalizeRange(source: ReadonlyArray<Pointer>): NormalizedRange | MoveSelectionError {
  if (source.length === 0) {
    return error("empty_selection", "move source must contain at least one pointer.");
  }

  let parent: Pointer | null = null;
  const indices: number[] = [];
  for (const pointer of source) {
    if (tryParsePointer(pointer) === null) {
      return error("invalid_pointer", `invalid JSON Pointer in move source: ${pointer}`, pointer);
    }
    const index = lastSegmentIndex(pointer);
    if (index === null) {
      return error("not_array_item", `move source pointer must end with an array index: ${pointer}`, pointer);
    }
    const itemParent = parentPointer(pointer);
    if (itemParent === null) {
      return error("not_array_item", `move source pointer has no parent array: ${pointer}`, pointer);
    }
    if (parent === null) {
      parent = itemParent;
    } else if (parent !== itemParent) {
      return error("mixed_parent", `move source pointers must share one parent array: ${parent} vs ${itemParent}`, pointer);
    }
    indices.push(index);
  }

  indices.sort((left, right) => left - right);
  const start = indices[0] as number;
  for (let offset = 0; offset < indices.length; offset += 1) {
    if (indices[offset] !== start + offset) {
      return error("not_contiguous", `move source must be a contiguous index range; got ${indices.join(", ")}`, parent ?? undefined);
    }
  }

  return { ok: true, parent: parent as Pointer, indices };
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): MoveSelectionError {
  const result: MoveSelectionError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `move patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(
  pointer: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): MoveSelectionError {
  const result: MoveSelectionError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `move patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: MoveSelectionErrorCode, reason: string, pointer?: Pointer): MoveSelectionError {
  const result: MoveSelectionError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
