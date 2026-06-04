import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  resolveSiblingRange,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type SiblingRangeErrorCode,
} from "zod-crud";

export type MoveSelectedErrorCode =
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

export interface MoveSelectedError {
  ok: false;
  code: MoveSelectedErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Move the selected block to just before or just after a reference sibling. */
export type MoveSelectedTarget =
  | { before: Pointer }
  | { after: Pointer };

export interface MoveSelectedChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  count: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers of the moved block at its new position, in order. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type MoveSelectedResult = MoveSelectedChange | MoveSelectedError;

export interface MoveSelected<TDocument> {
  canMoveSelected(source: ReadonlyArray<Pointer>, target: MoveSelectedTarget): MoveSelectedResult;
  moveSelected(source: ReadonlyArray<Pointer>, target: MoveSelectedTarget): MoveSelectedResult;
}

export function createMoveSelected<TDocument>(
  doc: JSONDocument<TDocument>,
): MoveSelected<TDocument> {
  return {
    canMoveSelected: (source, target) => canMoveSelected(doc, source, target),
    moveSelected: (source, target) => moveSelected(doc, source, target),
  };
}

export function canMoveSelected<TDocument>(
  doc: JSONDocument<TDocument>,
  source: ReadonlyArray<Pointer>,
  target: MoveSelectedTarget,
): MoveSelectedResult {
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

export function moveSelected<TDocument>(
  doc: JSONDocument<TDocument>,
  source: ReadonlyArray<Pointer>,
  target: MoveSelectedTarget,
): MoveSelectedResult {
  const change = canMoveSelected(doc, source, target);
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

// Selected-sibling-range normalization is shared core (RFC #87). Map its error
// codes back to this lab's existing codes so behavior stays identical.
const MOVE_ERROR_CODE: Record<SiblingRangeErrorCode, MoveSelectedErrorCode> = {
  empty_selection: "empty_selection",
  invalid_pointer: "invalid_pointer",
  not_array_item: "not_array_item",
  mixed_parent: "mixed_parent",
  non_contiguous: "not_contiguous",
};

function normalizeRange(source: ReadonlyArray<Pointer>): NormalizedRange | MoveSelectedError {
  const range = resolveSiblingRange(source, { requireContiguous: true });
  if (!range.ok) return error(MOVE_ERROR_CODE[range.code], range.reason, range.pointer);
  return { ok: true, parent: range.parent, indices: range.locations.map((location) => location.index) };
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): MoveSelectedError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `move patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(
  pointer: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): MoveSelectedError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `move patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: MoveSelectedErrorCode, reason: string, pointer?: Pointer): MoveSelectedError {
  const result: MoveSelectedError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
