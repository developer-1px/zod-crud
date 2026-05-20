// React entrypoint. Import from `zod-crud/react` when using hooks or React
// sidecars; pure consumers should import from `zod-crud`.

export { useJSONDocument } from "./hooks/useJSONDocument.js";
export { useJSON } from "./hooks/useJSON.js";
export { useSelection } from "./hooks/useSelection.js";
export { createSelection } from "./selection.js";
export { useJSONSlice } from "./hooks/useJSONSlice.js";
export { useDraft, useField } from "./hooks/useDraft.js";
export type {
  JSONDocument,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./hooks/useJSONDocument.js";
export type {
  ClipboardEmpty,
  ClipboardPasteResult,
  ClipboardReadOk,
  ClipboardReadResult,
  ClipboardSource,
  ClipboardState,
  ClipboardWriteOptions,
} from "./clipboard.js";
export type {
  Check,
  CheckErrorCode,
  CheckResult,
  CheckViolation,
} from "./check.js";
export type {
  EntriesResult,
  EntryKind,
  QueryResult,
  ReadEntry,
  ReadFacade,
  ReadResult,
} from "./read.js";
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
} from "./schema.js";
export type {
  DraftFieldState,
  DraftState,
} from "./hooks/useDraft.js";

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

export { useDebugLog } from "./sidecars/debug-log.js";
export type { DebugLog, DebugLogApi, DebugLogger } from "./sidecars/debug-log.js";

export type {
  HistoryMergeOptions,
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONLoadOptions,
  JSONOps,
  UseJSONOptions,
} from "./jsonOps.js";
export type {
  JSONPatchOperation,
  JSONResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";
export type { Pointer } from "./core/pointer/index.js";
export type {
  CreateSelectionOptions,
  HeadlessSelectionState,
  SelectionMode,
  JSONPoint,
  SelectionRange,
  SelectionRangeInput,
  SelectionSource,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";
export { JSONCrudError } from "./JSONCrudError.js";
