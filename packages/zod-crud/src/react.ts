// React entrypoint. Import from `zod-crud/react` when using hooks or React
// sidecars; pure consumers should import from `zod-crud`.

export { useJSONDocument } from "./hooks/useJSONDocument.js";
export { useJSON } from "./hooks/useJSON.js";
export { createJSON } from "./createJSON.js";
export { useSelection } from "./hooks/useSelection.js";
export { createSelection } from "./selection.js";
export { useJSONSlice } from "./hooks/useJSONSlice.js";
export { createDraft } from "./draft.js";
export { useDraft, useField } from "./hooks/useDraft.js";
export { createClipboard } from "./clipboard.js";
export type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentCommitSelection,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./hooks/useJSONDocument.js";
export type {
  CreateJSONOptions,
  HeadlessJSONState,
  JSONState,
} from "./createJSON.js";
export type {
  ClipboardEmpty,
  ClipboardPasteResult,
  ClipboardReadOk,
  ClipboardReadResult,
  ClipboardSource,
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
export type {
  CreateDraftOptions,
  DraftChangeListener,
  DraftDocument,
  DraftFieldState,
  DraftState,
  HeadlessDraftState,
} from "./draft.js";

export { createRecorder, useRecorder, replayRecording } from "./sidecars/recorder.js";
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
} from "./sidecars/recorder.js";

export { createDebugLog, useDebugLog } from "./sidecars/debug-log.js";
export type {
  CreateDebugLogOptions,
  DebugEvent,
  DebugLog,
  DebugLogApi,
  DebugLogger,
  HeadlessDebugLogApi,
} from "./sidecars/debug-log.js";

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
  compareSelectionPoints,
  orderPrimarySelectionRange,
  orderSelectionRange,
  orderSelectionRanges,
  selectionSpansForPointer,
  pointPointer,
  primaryPointer,
  primaryRange,
  rangeCount,
  restoreSelection,
  resolveSelectionCursor,
  resolveSelectionScope,
  selectedCount,
  selectedSource,
  selectSelectionScope,
  selectionSnapshot,
  selectionType,
} from "./core/selection/index.js";
export {
  replaceSelectionText,
  selectionTextEdits,
} from "./core/selection/textEdit.js";
export type {
  SelectionAction,
  SelectionContext,
  SelectionAffinity,
  SelectionEdge,
  SelectionSnap,
} from "./core/selection/index.js";
export { trackPointer } from "./core/track.js";
export type {
  JSONPatchOperation,
  JSONResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";
export type { Pointer } from "./core/pointer/index.js";
export { jsonEqual } from "./core/json.js";
export type { JSONPrimitive, JSONValue } from "./core/json.js";
export type {
  CreateSelectionOptions,
  HeadlessSelectionState,
  SelectionChangeListener,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionDirection,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionMode,
  SelectionOrderErrorCode,
  SelectionOrderOptions,
  SelectionPointOrderResult,
  SelectionPointerSpan,
  SelectionPointerSpansResult,
  SelectionRangeOrderResult,
  SelectionRangesOrderResult,
  JSONPoint,
  OrderedSelectionRange,
  OrderedSelectionRangeEntry,
  SelectionRange,
  SelectionRangeInput,
  SelectionSource,
  SelectionSpanOptions,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";
export type {
  ReplaceSelectionTextResult,
  SelectionTextEdit,
  SelectionTextEditErrorCode,
  SelectionTextEditOptions,
  SelectionTextEditsResult,
} from "./core/selection/textEdit.js";
export { JSONCrudError } from "./JSONCrudError.js";
