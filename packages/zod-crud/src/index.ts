export {
  createJsonCrud,
} from "./json-crud.js";

// SPEC.md §5 — canonical public surface.
export { useJson, JsonCrudError } from "./useJson.js";
export type { JsonOps, UseJsonOptions } from "./useJson.js";

export { applyOperation, applyPatch } from "./core/patch.js";
export type { JsonPatchOperation, JsonResult, ErrorCode } from "./core/patch.js";

export { parsePointer, buildPointer, escapeSegment, unescapeSegment, PointerSyntaxError } from "./core/pointer.js";
export type { Pointer } from "./core/pointer.js";
export {
  createJsonCrudState,
} from "./state/json-crud-state.js";

export { deserialize, serialize } from "./document/json-doc-serialization.js";
export { getPath } from "./document/json-doc-access.js";

export type {
  JsonCrud,
} from "./json-crud.js";

export type {
  SelectionPlan,
} from "./select.js";

export type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonPath,
  JsonValue,
  NodeId,
  OperationFailureCode,
  OperationResult,
  PasteMode,
  JsonCrudClipboardState,
  JsonCrudCommand,
  JsonCrudContext,
  JsonCrudDispatchFailure,
  JsonCrudDispatchResult,
  JsonCrudDispatchSuccess,
  JsonCrudEvent,
  JsonCrudHistoryEntry,
  JsonCrudHistoryState,
  JsonCrudRevision,
  JsonCrudSerializableOperationFailure,
  JsonCrudSerializableOperationResult,
  JsonCrudState,
} from "./types.js";
