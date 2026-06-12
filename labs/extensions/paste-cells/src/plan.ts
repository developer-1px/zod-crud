import { appendSegment, type JSONDocument, type JSONPatchOperation, lastSegmentIndex, parentPointer, type Pointer, tryParsePointer } from "@interactive-os/json-document";
import type { PasteCellsError, PasteCellsErrorCode, PasteCellsResult, PasteCellsTarget } from "./types.js";

export function canPasteGrid<TDocument>(
  doc: JSONDocument<TDocument>,
  target: PasteCellsTarget,
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
): PasteCellsResult {
  if (matrix.length === 0) {
    return error("empty_matrix", "grid paste matrix must contain at least one row.");
  }
  if (target.fields.length === 0) {
    return error("no_fields", "grid paste target must list at least one field column.");
  }
  for (const field of target.fields) {
    if (field !== "" && !field.startsWith("/")) {
      return error("invalid_pointer", `field must be empty or start with '/': ${field}`, field);
    }
  }

  if (tryParsePointer(target.at) === null) {
    return error("invalid_pointer", `invalid target pointer: ${target.at}`, target.at);
  }
  const startIndex = lastSegmentIndex(target.at);
  const parent = parentPointer(target.at);
  if (startIndex === null || parent === null) {
    return error("not_array_item", `grid paste target must be an array item: ${target.at}`, target.at);
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return error(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parent);
  }
  if (!Array.isArray(parentRead.value)) {
    return error("not_array", `grid paste parent is not an array: ${parent}`, parent);
  }
  const arrayLength = parentRead.value.length;
  if (startIndex + matrix.length > arrayLength) {
    return error(
      "region_out_of_range",
      `grid region needs rows ${startIndex}..${startIndex + matrix.length - 1} but array length is ${arrayLength}`,
      parent,
    );
  }

  const operations: JSONPatchOperation[] = [];
  const selectionAfter: Pointer[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    const itemPointer = appendSegment(parent, startIndex + row);
    selectionAfter.push(itemPointer);
    const cells = matrix[row] as ReadonlyArray<unknown>;
    const columns = Math.min(cells.length, target.fields.length);
    for (let col = 0; col < columns; col += 1) {
      const field = target.fields[col] as Pointer;
      const pointer = field === "" ? itemPointer : itemPointer + field;
      const next = cells[col];
      const current = doc.at(pointer);
      if (!current.ok || JSON.stringify(current.value) !== JSON.stringify(next)) {
        operations.push({ op: "replace", path: pointer, value: cloneJson(next) });
      }
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `grid paste patch rejected at ${parent}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    path: parent,
    rows: matrix.length,
    cols: target.fields.length,
    changed: operations.length > 0,
    operations,
    selectionAfter,
  };
}

function error(code: PasteCellsErrorCode, reason: string, pointer?: Pointer): PasteCellsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
