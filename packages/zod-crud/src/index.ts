// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

// === Boundary error + ops contract ===
export { JSONCrudError } from "./JSONCrudError.js";
export type {
  HistoryMergeOptions,
  HistoryTransactionOptions,
  JSONChangeListener,
  JSONChangeMetadata,
  JSONLoadOptions,
  JSONOps,
} from "./jsonOps.js";

// === Headless document facade ===
export { createJSONDocument } from "./createJSONDocument.js";
export type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./createJSONDocument.js";
export { createSelection } from "./selection.js";
export type {
  CreateSelectionOptions,
  HeadlessSelectionState,
  SelectionChangeListener,
  SelectionState,
  UseSelectionOptions,
} from "./selection.js";
export { createClipboard } from "./clipboard.js";
export type {
  ClipboardPasteResult,
  ClipboardReadResult,
  ClipboardState,
  ClipboardWriteOptions,
  CreateClipboardOptions,
} from "./clipboard.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch } from "./core/patch/index.js";
export type {
  JSONPatchOperation,
  JSONResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";

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
} from "./core/pointer/index.js";
export type { Pointer } from "./core/pointer/index.js";
export type { PointerOf, ValueAt } from "./core/pointer/types.js";

// === Selection — W3C Selection API 정합 ===
export type {
  JSONPoint,
  SelectionAction,
  SelectionContext,
  SelectionAffinity,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionDirection,
  SelectionEdge,
  SelectionMode,
  OrderedSelectionRange,
  OrderedSelectionRangeEntry,
  SelectionOrderErrorCode,
  SelectionOrderOptions,
  SelectionPointerSpan,
  SelectionPointerSpansResult,
  SelectionRange,
  SelectionRangeInput,
  SelectionRangeOrderResult,
  SelectionRangesOrderResult,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionSpanOptions,
  SelectionSnap,
  SelectionType,
} from "./core/selection/index.js";
export type {
  DeleteSelectionTextResult,
  ReplaceSelectionTextResult,
  SelectionTextEdit,
  SelectionTextDeleteDirection,
  SelectionTextDeleteOptions,
  SelectionTextEditErrorCode,
  SelectionTextEditOptions,
  SelectionTextEditsResult,
} from "./core/selection/textEdit.js";
export { trackPointer } from "./core/track.js";
