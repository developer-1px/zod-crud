import type {
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  JSONPatchOperation,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

import {
  protectedPasteTarget,
  protectedPatchOperation,
  protectedWrite,
} from "./match.js";
import type {
  ProtectedRange,
  ProtectedRangeCapabilityResult,
  ProtectedRangeEditResult,
  ProtectedRangeError,
  ProtectedRangePasteResult,
} from "./types.js";

export function canPatchProtectedRanges<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
  operations: JSONPatchInput,
): ProtectedRangeCapabilityResult {
  const patch = Array.isArray(operations) ? operations : [operations as JSONPatchOperation];
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

function patchFailure(result: Exclude<JSONResult, { ok: true }>): ProtectedRangeError {
  return {
    ok: false,
    code: "patch_failed",
    reason: result.reason ?? "protected range patch failed",
    result,
    ...(result.pointer === undefined ? {} : { pointer: result.pointer }),
  };
}
