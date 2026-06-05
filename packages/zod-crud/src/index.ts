// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

// === Boundary error + document metadata ===
export { JSONCrudError } from "./foundation/error.js";
export type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
} from "./application/document/history/metadata.js";

// === Headless document facade ===
export { createJSONDocument } from "./application/document/create.js";
export type {
  JSONCapabilityResult,
  JSONDocument,
  JSONDocumentOptions,
} from "./application/document/interface.js";
export type {
  JSONDocumentDuplicateError,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
} from "./application/document/edit/actions.js";
export type {
  JSONDocumentHistory,
} from "./application/document/history/undoRedo.js";
export type {
  JSONDocumentCommitOptions,
} from "./application/document/history/metadata.js";
export type {
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "./application/document/clipboard/contract.js";
export type { JSONPatchInput } from "./application/document/state/patch.js";
export type {
  ClipboardCopyOptions,
  ClipboardCopyError,
  ClipboardCopyOk,
  ClipboardCopyResult,
  ClipboardCutOk,
  ClipboardCutError,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardEmpty,
  ClipboardMutationOk,
  ClipboardPasteDiscriminatorMismatch,
  ClipboardPasteError,
  ClipboardPasteResult,
  ClipboardReadOk,
  ClipboardReadOptions,
  ClipboardReadResult,
  ClipboardState,
  ClipboardWriteOptions,
  ClipboardSource,
} from "./application/document/clipboard/contract.js";
export type {
  EntriesResult,
  EntryKind,
  QueryResult,
  ReadEntry,
  ReadResult,
} from "./application/document/read/read.js";
export type {
  SchemaDescription,
  SchemaKind,
} from "./application/document/schema/description.js";
export type {
  SchemaErrorCode,
  SchemaErrorResult,
  SchemaPathMode,
} from "./application/document/schema/resolve.js";
export type {
  SchemaDescriptionResult,
  SchemaKindResult,
  SchemaQueryResult,
} from "./application/document/schema/query.js";
export type { SchemaState } from "./application/document/schema/state.js";
export type {
  SelectionOptions,
  SelectionState,
} from "./application/document/selection/create.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch } from "./foundation/patch/schema.js";
export type {
  JSONPatchOperation,
  JSONResult,
} from "./foundation/patch/contract.js";

export { applyPatchToTrustedState } from "./domain/schema/validation/patch.js";

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
} from "./foundation/pointer/index.js";
export type { Pointer } from "./foundation/pointer/index.js";
export { resolveSiblingRange } from "./foundation/pointer/siblingRange.js";
export type {
  ResolveSiblingRangeOptions,
  SiblingLocation,
  SiblingRangeErrorCode,
  SiblingRangeResult,
} from "./foundation/pointer/siblingRange.js";

// === Selection — W3C Selection API 정합 ===
export type {
  SelectionAffinity,
  SelectionEdge,
  SelectionPoint,
  SelectionPointObject,
  SelectionRange,
  SelectionRangeInput,
} from "./domain/selection/point.js";
export type {
  SelectionContext,
  SelectionMode,
  SelectionSnap,
} from "./domain/selection/snap.js";
export type {
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
} from "./domain/selection/reducer.js";
export type {
  SelectionDirection,
  SelectionOrderedRange,
  SelectionOrderedRangeEntry,
  SelectionOrderErrorCode,
  SelectionOrderOptions,
  SelectionPointOrderResult,
  SelectionRangeOrderResult,
  SelectionRangesOrderResult,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
} from "./domain/selection/order.js";
export type {
  SelectionPointerSpan,
  SelectionPointerSpansResult,
  SelectionSpanOptions,
} from "./domain/selection/spans.js";
export type {
  SelectionSource,
  SelectionType,
} from "./domain/selection/read.js";
export type {
  ReplaceSelectionTextResult,
  SelectionTextEdit,
  SelectionTextEditErrorCode,
  SelectionTextEditOptions,
  SelectionTextEditsResult,
} from "./domain/selection/textEdit.js";
export type {
  DeleteSelectionTextResult,
  SelectionTextDeleteDirection,
  SelectionTextDeleteOptions,
} from "./domain/selection/textDelete.js";
export { trackPointer } from "./foundation/patch/track.js";
