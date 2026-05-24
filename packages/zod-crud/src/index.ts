// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

// === Boundary error + document metadata ===
export { JSONCrudError } from "./foundation/errors.js";
export type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
} from "./application/document/ops.js";

// === Headless document facade ===
export { createJSONDocument } from "./application/document/createJSONDocument.js";
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
  UseJSONDocumentOptions,
} from "./application/document/createJSONDocument.js";
export type {
  ClipboardCopyOptions,
  ClipboardCutOk,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardEmpty,
  ClipboardMutationOk,
  ClipboardPasteResult,
  ClipboardReadOk,
  ClipboardReadOptions,
  ClipboardReadResult,
  ClipboardState,
  ClipboardWriteOptions,
} from "./application/document/clipboard.js";
export type {
  EntriesResult,
  EntryKind,
  QueryResult,
  ReadEntry,
  ReadResult,
} from "./application/document/read.js";
export type {
  SchemaDescription,
  SchemaDescriptionResult,
  SchemaErrorCode,
  SchemaErrorResult,
  SchemaKind,
  SchemaKindResult,
  SchemaPathMode,
  SchemaQueryResult,
  SchemaState,
} from "./application/document/schema.js";
export type {
  SelectionState,
  UseSelectionOptions,
} from "./application/document/selection.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch } from "./foundation/json-patch/index.js";
export { applyPatchToTrustedState } from "./application/trustedPatch.js";
export type {
  JSONPatchOperation,
  JSONResult,
} from "./foundation/json-patch/index.js";

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
} from "./foundation/json-pointer/index.js";
export type { Pointer } from "./foundation/json-pointer/index.js";

// === Selection — W3C Selection API 정합 ===
export type {
  JSONPointObject,
  JSONPoint,
  OrderedSelectionRange,
  OrderedSelectionRangeEntry,
  SelectionAction,
  SelectionAffinity,
  SelectionContext,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionDirection,
  SelectionEdge,
  SelectionMode,
  SelectionOrderErrorCode,
  SelectionOrderOptions,
  SelectionPointOrderResult,
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
  SelectionSource,
  SelectionSpanOptions,
  SelectionSnap,
  SelectionType,
} from "./domain/selection/index.js";
export type {
  DeleteSelectionTextResult,
  ReplaceSelectionTextResult,
  SelectionTextDeleteDirection,
  SelectionTextDeleteOptions,
  SelectionTextEdit,
  SelectionTextEditErrorCode,
  SelectionTextEditOptions,
  SelectionTextEditsResult,
} from "./domain/selection/textEdit.js";
export type {
  ClipboardSource,
  CopyError,
  CopyOk,
} from "./domain/verbs/copy.js";
export type {
  CutError,
  CutOk,
} from "./domain/verbs/cut.js";
export type {
  DuplicateError,
  DuplicateOk,
} from "./domain/verbs/duplicate.js";
export type {
  PasteDuMismatch,
  PasteError,
  PasteOptions,
  PasteTarget,
} from "./domain/verbs/paste.js";
export { trackPointer } from "./domain/tracking/pointer.js";
