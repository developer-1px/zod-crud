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

export type GridPasteErrorCode =
  | "empty_matrix"
  | "no_fields"
  | "invalid_pointer"
  | "not_array_item"
  | "path_not_found"
  | "not_array"
  | "region_out_of_range"
  | "patch_rejected"
  | "patch_failed";

export interface GridPasteError {
  ok: false;
  code: GridPasteErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface GridPasteTarget {
  /** Top-left item pointer, e.g. `"/rows/2"`. */
  at: Pointer;
  /** Column order as relative field sub-pointers, e.g. `["/name", "/qty"]`. */
  fields: ReadonlyArray<Pointer>;
}

export interface GridPasteChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  rows: number;
  cols: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers of the pasted rows, in order. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type GridPasteResult = GridPasteChange | GridPasteError;

export interface GridPaste<TDocument> {
  canPasteGrid(target: GridPasteTarget, matrix: ReadonlyArray<ReadonlyArray<unknown>>): GridPasteResult;
  pasteGrid(target: GridPasteTarget, matrix: ReadonlyArray<ReadonlyArray<unknown>>): GridPasteResult;
}

export function createGridPaste<TDocument>(doc: JSONDocument<TDocument>): GridPaste<TDocument> {
  return {
    canPasteGrid(target, matrix) {
      return canPasteGrid(doc, target, matrix);
    },
    pasteGrid(target, matrix) {
      return pasteGrid(doc, target, matrix);
    },
  };
}

export function canPasteGrid<TDocument>(
  doc: JSONDocument<TDocument>,
  target: GridPasteTarget,
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
): GridPasteResult {
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
      if (!current.ok || !jsonEqual(current.value, next)) {
        operations.push({ op: "replace", path: pointer, value: cloneJson(next) });
      }
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(parent, capability);
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

export function pasteGrid<TDocument>(
  doc: JSONDocument<TDocument>,
  target: GridPasteTarget,
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
): GridPasteResult {
  const change = canPasteGrid(doc, target, matrix);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): GridPasteError {
  const result: GridPasteError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `grid paste patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(
  pointer: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): GridPasteError {
  const result: GridPasteError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `grid paste patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: GridPasteErrorCode, reason: string, pointer?: Pointer): GridPasteError {
  const result: GridPasteError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
