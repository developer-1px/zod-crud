// React entrypoint. Keep this facade limited to React hooks and their return
// types; pure/headless APIs live under `zod-crud`.

export { useJSONDocument } from "./hooks/useJSONDocument.js";

export type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentCommitSelection,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
} from "./hooks/useJSONDocument.js";
