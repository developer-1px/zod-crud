// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

import type * as z from "zod";
import { applyPatchWithLocalSchemaValidation } from "./domain/schema/validation/patch.js";
import { applyPatchToTrustedState as applyPatchToTrustedStateCore } from "./foundation/patch/schema.js";
import type {
  ApplyResult,
  JSONPatchOperation,
} from "./foundation/patch/types.js";

// === Boundary error + document metadata ===
export { JSONCrudError } from "./foundation/error.js";
export type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
} from "./application/document/runtime/types.js";

// === Headless document facade ===
export { createJSONDocument } from "./application/document/create.js";
export type {
  JSONCapabilityResult,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateError,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentHistory,
  JSONDocumentOptions,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONDocument,
  JSONPatchInput,
} from "./application/document/types.js";
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
} from "./application/document/clipboard/types.js";
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
} from "./application/document/selection/create.js";
export type { SelectionOptions } from "./application/document/runtime/types.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch } from "./foundation/patch/schema.js";
export type {
  JSONPatchOperation,
  JSONResult,
} from "./foundation/patch/types.js";

export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return applyPatchWithLocalSchemaValidation(schema, state, ops)
    ?? applyPatchToTrustedStateCore(schema, state, ops);
}

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
  SelectionPointObject,
  SelectionPoint,
  SelectionOrderedRange,
  SelectionOrderedRangeEntry,
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
} from "./domain/selection/types.js";
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
export { trackPointer } from "./domain/pointer/track.js";
