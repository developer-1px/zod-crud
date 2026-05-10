// zod-crud — canonical public surface.
// 정본: SPEC.md §5. 변경 시 SPEC.md를 먼저 갱신할 것.

// Identity surface (SPEC §5.10) — facade
export { useJsonDocument } from "./useJsonDocument.js";
export type {
  JsonDocument,
  JsonDocumentHistory,
  UseJsonDocumentOptions,
} from "./useJsonDocument.js";

// Axis 1 — Data substrate
export { useJson, JsonCrudError } from "./useJson.js";
export type { JsonOps, UseJsonOptions, JsonChangeListener } from "./useJson.js";

export { applyOperation, applyPatch } from "./core/patch.js";
export type {
  JsonPatchOperation,
  JsonResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch.js";

export {
  parsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
} from "./core/pointer.js";
export type { Pointer } from "./core/pointer.js";
export type { PointerOf, ValueAt } from "./core/path-types.js";

export { serialize, parse, safeParse } from "./core/serialize.js";

// Axis 2 — Editor abstractions (SPEC §0.2 / §5.7-§5.9)
export { useSelection } from "./useSelection.js";
export type {
  SelectionMode,
  SelectionState,
  UseSelectionOptions,
} from "./useSelection.js";

export { useFocus } from "./useFocus.js";
export type { FocusState, UseFocusOptions } from "./useFocus.js";

export { trackPointer, trackPointers } from "./core/track.js";
