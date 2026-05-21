// React entrypoint. Keep this facade limited to React hooks and their return
// types; pure/headless APIs live under `zod-crud`.

export { useJSONDocument } from "./hooks/useJSONDocument.js";
export { useJSON } from "./hooks/useJSON.js";
export { useSelection } from "./hooks/useSelection.js";
export { useJSONSlice } from "./hooks/useJSONSlice.js";
export { useDraft, useField } from "./hooks/useDraft.js";
export { useRecorder } from "./sidecars/recorder.js";

export type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentCommitSelection,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./hooks/useJSONDocument.js";

export type {
  JSONOps,
  UseJSONOptions,
} from "./hooks/useJSON.js";

export type {
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";

export type {
  DraftFieldState,
  DraftState,
} from "./hooks/useDraft.js";

export type { RecorderApi } from "./sidecars/recorder.js";
