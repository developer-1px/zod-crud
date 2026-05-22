// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

// === Boundary error + document metadata ===
export { JSONCrudError } from "../foundation/errors.js";
export type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
} from "../application/document/ops.js";

// === Headless document facade ===
export { createJSONDocument } from "../application/document/createJSONDocument.js";
export type {
  JSONCapabilityResult,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentHistory,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONDocument,
  JSONPatchInput,
} from "../application/document/createJSONDocument.js";
export type { SelectionState } from "../application/document/selection.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch } from "../foundation/json-patch/index.js";
export type {
  JSONPatchOperation,
  JSONResult,
} from "../foundation/json-patch/index.js";

// === RFC 6901 — JSON Pointer ===
export {
  parsePointer,
  tryParsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
} from "../foundation/json-pointer/index.js";
export type { Pointer } from "../foundation/json-pointer/index.js";

// === Selection — W3C Selection API 정합 ===
export type {
  JSONPoint,
  SelectionAction,
  SelectionRange,
  SelectionSource,
  SelectionSnap,
} from "../domain/selection/index.js";
export { trackPointer } from "../domain/tracking/pointer.js";
