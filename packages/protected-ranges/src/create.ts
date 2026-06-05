import type {
  JSONDocument,
} from "zod-crud";

import {
  copyRange,
} from "./copy.js";
import {
  canDeleteProtectedRange,
  canInsertProtectedRange,
  canMoveProtectedRange,
  canPasteProtectedRange,
  canPatchProtectedRanges,
  canReplaceProtectedRange,
  deleteProtectedRange,
  insertProtectedRange,
  moveProtectedRange,
  pasteProtectedRange,
  patchProtectedRanges,
  replaceProtectedRange,
} from "./operations.js";
import {
  protectedWrite,
} from "./match.js";
import type {
  ProtectedRange,
  ProtectedRanges,
} from "./types.js";

export function createProtectedRanges<TDocument>(
  doc: JSONDocument<TDocument>,
  ranges: ReadonlyArray<ProtectedRange>,
): ProtectedRanges<TDocument> {
  const protectedRanges = ranges.map(copyRange);

  return {
    list: () => protectedRanges.map(copyRange),
    isProtected: (pointer) => protectedWrite(protectedRanges, "patch", pointer, "replace") ?? { ok: true },
    canPatch: (operations) => canPatchProtectedRanges(doc, protectedRanges, operations),
    patch: (operations) => patchProtectedRanges(doc, protectedRanges, operations),
    canInsert: (path, value) => canInsertProtectedRange(doc, protectedRanges, path, value),
    insert: (path, value) => insertProtectedRange(doc, protectedRanges, path, value),
    canReplace: (path, value) => canReplaceProtectedRange(doc, protectedRanges, path, value),
    replace: (path, value) => replaceProtectedRange(doc, protectedRanges, path, value),
    canDelete: (path) => canDeleteProtectedRange(doc, protectedRanges, path),
    delete: (path) => deleteProtectedRange(doc, protectedRanges, path),
    canMove: (source, target) => canMoveProtectedRange(doc, protectedRanges, source, target),
    move: (source, target) => moveProtectedRange(doc, protectedRanges, source, target),
    canPaste: (target, options) => canPasteProtectedRange(doc, protectedRanges, target, options),
    paste: (target, options) => pasteProtectedRange(doc, protectedRanges, target, options),
  };
}
