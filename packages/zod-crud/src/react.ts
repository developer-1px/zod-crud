// React entrypoint. Import from `zod-crud/react` when using hooks or React
// sidecars; pure consumers should import from `zod-crud`.

export { useJSONDocument } from "./hooks/useJSONDocument.js";
export { useJSON } from "./hooks/useJSON.js";
export { useSelection } from "./hooks/useSelection.js";
export { useJSONSlice } from "./hooks/useJSONSlice.js";
export { useDraft, useField } from "./hooks/useDraft.js";
export type {
  JSONDocument,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./hooks/useJSONDocument.js";
export type {
  DraftFieldState,
  DraftState,
} from "./hooks/useDraft.js";

export { useRecorder, replayRecording } from "./sidecars/recorder.js";
export type { RecordedStep, RecorderApi, Recording, ReplayOptions } from "./sidecars/recorder.js";

export { useDebugLog } from "./sidecars/debug-log.js";
export type { DebugLog, DebugLogApi, DebugLogger } from "./sidecars/debug-log.js";

export type {
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
  SelectionMode,
  JSONPoint,
  SelectionRange,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";
export { JSONCrudError } from "./JSONCrudError.js";
