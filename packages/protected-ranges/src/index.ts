import {
  parentPointer,
  tryParsePointer,
  type ClipboardPasteResult,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type JSONPatchInput,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export interface ProtectedRange {
  id: string;
  pointer: Pointer;
  label?: string;
}

export interface ProtectedRangeSummary extends ProtectedRange {}

export type ProtectedRangeErrorCode =
  | "invalid_pointer"
  | "protected_range"
  | "patch_rejected"
  | "patch_failed";

export type ProtectedRangeOperation =
  | "insert"
  | "replace"
  | "delete"
  | "move"
  | "patch"
  | "paste";

export interface ProtectedRangeError {
  ok: false;
  code: ProtectedRangeErrorCode;
  reason: string;
  operation?: ProtectedRangeOperation;
  pointer?: Pointer;
  range?: ProtectedRangeSummary;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type ProtectedRangeCapabilityResult =
  | JSONCapabilityResult
  | ProtectedRangeError;

export type ProtectedRangeEditResult =
  | JSONResult
  | JSONCapabilityResult
  | ProtectedRangeError;

export type ProtectedRangePasteResult<TDocument> =
  | ClipboardPasteResult<TDocument>
  | JSONCapabilityResult
  | ProtectedRangeError;

export interface ProtectedRanges<TDocument> {
  list(): ReadonlyArray<ProtectedRangeSummary>;
  isProtected(pointer: Pointer): ProtectedRangeCapabilityResult;
  canPatch(operations: JSONPatchInput): ProtectedRangeCapabilityResult;
  patch(operations: JSONPatchInput): ProtectedRangeEditResult;
  canInsert(path: Pointer, value: unknown): ProtectedRangeCapabilityResult;
  insert(path: Pointer, value: unknown): ProtectedRangeEditResult;
  canReplace(path: Pointer, value: unknown): ProtectedRangeCapabilityResult;
  replace(path: Pointer, value: unknown): ProtectedRangeEditResult;
  canDelete(path: Pointer): ProtectedRangeCapabilityResult;
  delete(path: Pointer): ProtectedRangeEditResult;
  canMove(source: Pointer, target: Pointer): ProtectedRangeCapabilityResult;
  move(source: Pointer, target: Pointer): ProtectedRangeEditResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ProtectedRangeCapabilityResult;
  paste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ProtectedRangePasteResult<TDocument>;
}

export function createProtectedRanges<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
): ProtectedRanges<TDocument> {
  const protectedRanges = ranges.map(copyRange);

  return {
    list() {
      return protectedRanges.map(copyRange);
    },
    isProtected(pointer) {
      return protectedWrite(protectedRanges, "patch", pointer, "replace") ?? { ok: true };
    },
    canPatch(operations) {
      return canPatchProtectedRanges(doc, protectedRanges, operations);
    },
    patch(operations) {
      return patchProtectedRanges(doc, protectedRanges, operations);
    },
    canInsert(path, value) {
      return canInsertProtectedRange(doc, protectedRanges, path, value);
    },
    insert(path, value) {
      return insertProtectedRange(doc, protectedRanges, path, value);
    },
    canReplace(path, value) {
      return canReplaceProtectedRange(doc, protectedRanges, path, value);
    },
    replace(path, value) {
      return replaceProtectedRange(doc, protectedRanges, path, value);
    },
    canDelete(path) {
      return canDeleteProtectedRange(doc, protectedRanges, path);
    },
    delete(path) {
      return deleteProtectedRange(doc, protectedRanges, path);
    },
    canMove(source, target) {
      return canMoveProtectedRange(doc, protectedRanges, source, target);
    },
    move(source, target) {
      return moveProtectedRange(doc, protectedRanges, source, target);
    },
    canPaste(target, options) {
      return canPasteProtectedRange(doc, protectedRanges, target, options);
    },
    paste(target, options) {
      return pasteProtectedRange(doc, protectedRanges, target, options);
    },
  };
}

export function canPatchProtectedRanges<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  operations: JSONPatchInput,
): ProtectedRangeCapabilityResult {
  const patch = toPatchArray(operations);
  for (const operation of patch) {
    const blocked = protectedPatchOperation(ranges, operation);
    if (blocked) return blocked;
  }

  return doc.canPatch(patch);
}

export function patchProtectedRanges<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  operations: JSONPatchInput,
): ProtectedRangeEditResult {
  const canPatch = canPatchProtectedRanges(doc, ranges, operations);
  if (!canPatch.ok) return canPatch;

  const result = doc.patch(operations);
  return result.ok ? result : patchFailure(result);
}

export function canInsertProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
  value: unknown,
): ProtectedRangeCapabilityResult {
  const blocked = protectedWrite(ranges, "insert", path, "add");
  return blocked ?? doc.canInsert(path, value);
}

export function insertProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
  value: unknown,
): ProtectedRangeEditResult {
  const canInsert = canInsertProtectedRange(doc, ranges, path, value);
  if (!canInsert.ok) return canInsert;
  return doc.insert(path, value);
}

export function canReplaceProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
  value: unknown,
): ProtectedRangeCapabilityResult {
  const blocked = protectedWrite(ranges, "replace", path, "replace");
  return blocked ?? doc.canReplace(path, value);
}

export function replaceProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
  value: unknown,
): ProtectedRangeEditResult {
  const canReplace = canReplaceProtectedRange(doc, ranges, path, value);
  if (!canReplace.ok) return canReplace;
  return doc.replace(path, value);
}

export function canDeleteProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
): ProtectedRangeCapabilityResult {
  const blocked = protectedWrite(ranges, "delete", path, "remove");
  return blocked ?? doc.canDelete(path);
}

export function deleteProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  path: Pointer,
): ProtectedRangeEditResult {
  const canDelete = canDeleteProtectedRange(doc, ranges, path);
  if (!canDelete.ok) return canDelete;
  return doc.delete(path);
}

export function canMoveProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  source: Pointer,
  target: Pointer,
): ProtectedRangeCapabilityResult {
  const sourceBlocked = protectedWrite(ranges, "move", source, "remove");
  if (sourceBlocked) return sourceBlocked;
  const targetBlocked = protectedWrite(ranges, "move", target, "add");
  return targetBlocked ?? doc.canMove(source, target);
}

export function moveProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  source: Pointer,
  target: Pointer,
): ProtectedRangeEditResult {
  const canMove = canMoveProtectedRange(doc, ranges, source, target);
  if (!canMove.ok) return canMove;
  return doc.move(source, target);
}

export function canPasteProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  target: JSONDocumentPasteTarget,
  options?: JSONDocumentPasteOptions,
): ProtectedRangeCapabilityResult {
  const blocked = protectedPasteTarget(ranges, target);
  return blocked ?? doc.canPaste(target, options);
}

export function pasteProtectedRange<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  target: JSONDocumentPasteTarget,
  options?: JSONDocumentPasteOptions,
): ProtectedRangePasteResult<TDocument> {
  const canPaste = canPasteProtectedRange(doc, ranges, target, options);
  if (!canPaste.ok) return canPaste;
  return doc.paste(target, options);
}

function protectedPatchOperation(
  ranges: ReadonlyArray<ProtectedRange>,
  operation: JSONPatchOperation,
): ProtectedRangeError | null {
  switch (operation.op) {
    case "add":
      return protectedWrite(ranges, "patch", operation.path, "add");
    case "remove":
      return protectedWrite(ranges, "patch", operation.path, "remove");
    case "replace":
      return protectedWrite(ranges, "patch", operation.path, "replace");
    case "move":
      return protectedWrite(ranges, "patch", operation.from, "remove")
        ?? protectedWrite(ranges, "patch", operation.path, "add");
    case "copy":
      return protectedWrite(ranges, "patch", operation.path, "add");
    case "test":
      return null;
  }
}

function protectedPasteTarget(
  ranges: ReadonlyArray<ProtectedRange>,
  target: JSONDocumentPasteTarget,
): ProtectedRangeError | null {
  if (typeof target === "string") return protectedWrite(ranges, "paste", target, "add");
  if ("replace" in target) return protectedWrite(ranges, "paste", target.replace, "replace");
  if ("before" in target) return protectedWrite(ranges, "paste", target.before, "add");
  if ("after" in target) {
    const insertion = insertionAfter(target.after);
    return protectedWrite(ranges, "paste", insertion, "add");
  }
  return null;
}

function protectedWrite(
  ranges: ReadonlyArray<ProtectedRange>,
  operation: ProtectedRangeOperation,
  pointer: Pointer,
  kind: "add" | "remove" | "replace",
): ProtectedRangeError | null {
  const parsed = tryParsePointer(pointer);
  if (parsed === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid pointer: ${pointer}`,
      operation,
    };
  }

  for (const range of ranges) {
    const direct = overlapsProtectedSubtree(pointer, range.pointer);
    if (direct || shiftsProtectedArrayItem(pointer, range.pointer, kind)) {
      return protectedRangeError(operation, pointer, range);
    }
  }
  return null;
}

function overlapsProtectedSubtree(pointer: Pointer, protectedPointer: Pointer): boolean {
  return isSameOrDescendant(pointer, protectedPointer)
    || isSameOrDescendant(protectedPointer, pointer);
}

function isSameOrDescendant(pointer: Pointer, ancestor: Pointer): boolean {
  if (pointer === ancestor) return true;
  if (ancestor === "") return pointer.startsWith("/");
  return pointer.startsWith(`${ancestor}/`);
}

function shiftsProtectedArrayItem(
  pointer: Pointer,
  protectedPointer: Pointer,
  kind: "add" | "remove" | "replace",
): boolean {
  if (kind === "replace") return false;

  const pointerLocation = arrayItemLocation(pointer);
  const protectedLocation = arrayItemLocation(protectedPointer);
  if (pointerLocation === null || protectedLocation === null) return false;
  if (pointerLocation.parent !== protectedLocation.parent) return false;
  if (pointerLocation.index === "-") return false;
  if (protectedLocation.index === "-") return false;

  return pointerLocation.index <= protectedLocation.index;
}

function arrayItemLocation(pointer: Pointer): { parent: Pointer; index: number | "-" } | null {
  const parent = parentPointer(pointer);
  if (parent === null) return null;
  const last = pointer.slice(parent === "" ? 1 : parent.length + 1);
  if (last === "-") return { parent, index: "-" };
  if (!/^(0|[1-9]\d*)$/.test(last)) return null;
  return { parent, index: Number(last) };
}

function insertionAfter(pointer: Pointer): Pointer {
  const location = arrayItemLocation(pointer);
  if (location === null || location.index === "-") return pointer;
  const suffix = String(location.index + 1);
  return `${location.parent === "" ? "" : location.parent}/${suffix}` as Pointer;
}

function protectedRangeError(
  operation: ProtectedRangeOperation,
  pointer: Pointer,
  range: ProtectedRange,
): ProtectedRangeError {
  return {
    ok: false,
    code: "protected_range",
    reason: `${pointer} touches protected range ${range.pointer}`,
    operation,
    pointer,
    range: copyRange(range),
  };
}

function patchFailure(result: Exclude<JSONResult, { ok: true }>): ProtectedRangeError {
  const error: ProtectedRangeError = {
    ok: false,
    code: "patch_failed",
    reason: result.reason ?? "protected range patch failed",
    result,
  };
  if (result.pointer !== undefined) error.pointer = result.pointer;
  return error;
}

function toPatchArray(operations: JSONPatchInput): ReadonlyArray<JSONPatchOperation> {
  return Array.isArray(operations) ? operations : [operations as JSONPatchOperation];
}

function copyRange(range: ProtectedRange): ProtectedRange {
  const copy: ProtectedRange = {
    id: range.id,
    pointer: range.pointer,
  };
  if (range.label !== undefined) copy.label = range.label;
  return copy;
}
