export { createProtectedRanges } from "./create.js";
export {
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
export type {
  ProtectedRange,
  ProtectedRangeCapabilityResult,
  ProtectedRangeEditResult,
  ProtectedRangeError,
  ProtectedRangeErrorCode,
  ProtectedRangeOperation,
  ProtectedRangePasteResult,
  ProtectedRangeSummary,
  ProtectedRanges,
} from "./types.js";
