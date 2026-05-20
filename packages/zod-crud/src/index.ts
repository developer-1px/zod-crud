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
  UseJSONOptions,
} from "./jsonOps.js";
export {
  EMPTY_HISTORY,
  emptyHistory,
  back as historyBack,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  commit as historyCommit,
  forward as historyForward,
  mergeLast as historyMergeLast,
} from "./core/history.js";
export type { HistoryStack } from "./core/history.js";

// === Headless document facade ===
export { createJSONDocument } from "./createJSONDocument.js";
export type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentCommitSelection,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./createJSONDocument.js";
export { createJSON } from "./createJSON.js";
export type {
  CreateJSONOptions,
  HeadlessJSONState,
  JSONState,
} from "./createJSON.js";
export { createSelection } from "./selection.js";
export type {
  CreateSelectionOptions,
  HeadlessSelectionState,
  SelectionChangeListener,
  SelectionState,
  UseSelectionOptions,
} from "./selection.js";
export { createDraft } from "./draft.js";
export type {
  CreateDraftOptions,
  DraftChangeListener,
  DraftDocument,
  DraftFieldState,
  DraftState,
  HeadlessDraftState,
} from "./draft.js";
export { createClipboard } from "./clipboard.js";
export type {
  ClipboardEmpty,
  ClipboardPasteResult,
  ClipboardReadOk,
  ClipboardReadResult,
  ClipboardState,
  ClipboardWriteOptions,
  CreateClipboardOptions,
} from "./clipboard.js";
export { createCommands } from "./commands/buildCommands.js";
export type {
  CommandSelectionState,
  Commands,
  CreateCommandsOptions,
  ReplaceCommandResult,
} from "./commands/buildCommands.js";
export { createCan } from "./commands/buildCan.js";
export type {
  Can,
  CreateCanOptions,
} from "./commands/buildCan.js";
export { createCheck } from "./check.js";
export type {
  Check,
  CheckErrorCode,
  CheckResult,
  CheckViolation,
  CreateCheckOptions,
} from "./check.js";
export { createRead } from "./read.js";
export type {
  CreateReadOptions,
  EntriesResult,
  EntryKind,
  QueryResult,
  ReadEntry,
  ReadFacade,
  ReadResult,
} from "./read.js";
export { createSchema } from "./schema.js";
export type {
  CreateSchemaOptions,
  SchemaDescription,
  SchemaDescriptionResult,
  SchemaErrorCode,
  SchemaErrorResult,
  SchemaKind,
  SchemaKindResult,
  SchemaPathMode,
  SchemaQueryResult,
  SchemaState,
} from "./schema.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch, computeInverses } from "./core/patch/index.js";
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

// === JSON serialize helpers ===
export { serialize, parse, safeParse } from "./core/pointer/serialize.js";

// === Selection — W3C Selection API 정합 ===
export type {
  JSONPoint,
  SelectionAffinity,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionEdge,
  SelectionMode,
  SelectionRange,
  SelectionRangeInput,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionSource,
  SelectionType,
} from "./core/selection/index.js";
export { trackPointer } from "./core/track.js";
export {
  EMPTY_SELECTION,
  anchorPointer,
  caretPoint,
  caretPointer,
  extendSelectionCursor,
  focusPointer,
  hasSelection,
  isCollapsed,
  isSelected,
  moveSelectionCursor,
  pointPointer,
  primaryPointer,
  primaryRange,
  rangeCount,
  restoreSelection,
  resolveSelectionScope,
  resolveSelectionCursor,
  selectedCount,
  selectedSource,
  selectSelectionScope,
  selectionSnapshot,
  selectionType,
} from "./core/selection/index.js";

// === Sidecars — 횡단 관심사 ===
// React sidecar hooks live under `zod-crud/react`.
export { createRecorder, replayRecording } from "./sidecars/replayRecording.js";
export type {
  CreateRecorderOptions,
  HeadlessRecorderApi,
  RecordedStep,
  RecorderApi,
  Recording,
  ReplayDocumentTarget,
  ReplayOptions,
  ReplaySelectionTarget,
  ReplayTarget,
} from "./sidecars/replayRecording.js";
export { createDebugLog } from "./sidecars/createDebugLog.js";
export type {
  CreateDebugLogOptions,
  DebugEvent,
  DebugLog,
  DebugLogApi,
  DebugLogger,
  HeadlessDebugLogApi,
} from "./sidecars/createDebugLog.js";

// HTTP transport — RFC 5789 + 6902 + 7396 wire format.
export {
  buildPatchRequest,
  withIfMatch,
  parsePatchResponse,
  parseMergePatch,
  applyMergePatch,
  JSON_PATCH_MIME,
  MERGE_PATCH_MIME,
} from "./sidecars/http.js";
export type { ParseResult, ParseError, PatchRequest } from "./sidecars/http.js";

// === Clipboard verbs ===
export {
  copy,
  toClipboardItems,
  toMarkdown,
  toTsv,
} from "./verbs/copy.js";
export type {
  ClipboardItemMap,
  ClipboardItemOptions,
  ClipboardSource,
  CopyError,
  CopyOk,
  CopyResult,
} from "./verbs/copy.js";
export { paste } from "./verbs/paste.js";
export type {
  PasteDuMismatch,
  PasteError,
  PasteMode,
  PasteOk,
  PasteOptions,
  RekeyContext,
  RekeyOptions,
  RekeyResult,
  RekeyStrategy,
} from "./verbs/paste.js";
export { duplicate } from "./verbs/duplicate.js";
export type {
  DuplicateError,
  DuplicateOk,
  DuplicateOpts,
} from "./verbs/duplicate.js";
export { cut } from "./verbs/cut.js";
export type { CutError, CutOk } from "./verbs/cut.js";
export { find, queryPointers } from "./verbs/find.js";
export type { FindError, FindOk } from "./verbs/find.js";
export { move } from "./verbs/move.js";
export type { MoveError, MoveOk, MoveResult } from "./verbs/move.js";
export { redo } from "./verbs/redo.js";
export type { RedoResult } from "./verbs/redo.js";
export { replace } from "./verbs/replace.js";
export type { ReplaceError, ReplaceOk } from "./verbs/replace.js";
export { select } from "./verbs/select.js";
export type { SelectionAction, SelectionSnap } from "./verbs/select.js";
export { undo } from "./verbs/undo.js";
export type { UndoEntry, UndoNoop, UndoResult } from "./verbs/undo.js";

// === JSON Schema bridge — RFC 8927 / draft-bhutton ===
export { toJSONSchema, fromJSONSchema } from "./core/schema/bridge.js";
export type { PreFlightErrorCode } from "./core/schema/preFlight.js";
