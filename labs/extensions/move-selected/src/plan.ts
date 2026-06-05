import { appendSegment, type JSONDocument, type JSONPatchOperation, lastSegmentIndex, parentPointer, type Pointer, resolveSiblingRange, type SiblingRangeErrorCode, tryParsePointer } from "zod-crud";
import type { MoveSelectedError, MoveSelectedErrorCode, MoveSelectedResult, MoveSelectedTarget, NormalizedRange } from "./types.js";

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

  const changed = JSON.stringify(items) !== JSON.stringify(nextItems);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: range.parent, value: cloneJson(nextItems) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `move patch rejected at ${range.parent}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
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

function error(code: MoveSelectedErrorCode, reason: string, pointer?: Pointer): MoveSelectedError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
