// zod-crud — canonical public surface.
// 정본: SPEC.md §5. 변경 시 SPEC.md를 먼저 갱신할 것.
// 어휘: ADR-0002 — 편집 어휘 wrapper. Axis 1/2 / "Editor abstractions" 어휘 폐기.

// Identity facade — useJsonDocument (단일 진입점)
export { useJsonDocument } from "./hooks/useJsonDocument.js";
export type {
  JsonDocument,
  JsonDocumentHistory,
  UseJsonDocumentOptions,
} from "./hooks/useJsonDocument.js";

// Data substrate — RFC 6901 + 6902
export { useJson, JsonCrudError } from "./hooks/useJson.js";
export type { JsonOps, UseJsonOptions, JsonChangeListener } from "./hooks/useJson.js";

export { applyOperation, applyPatch, computeInverses } from "./core/patch/index.js";
export type {
  JsonPatchOperation,
  JsonResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";

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
} from "./core/pointer/index.js";
export type { Pointer } from "./core/pointer/index.js";
export type { PointerOf, ValueAt } from "./core/pointer/types.js";

export { serialize, parse, safeParse } from "./core/pointer/serialize.js";

// Selection — W3C Selection API 정합. caret = collapsed selection.
export { useSelection } from "./hooks/useSelection.js";
export type {
  SelectionMode,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";

export { trackPointer, trackPointers, pickAutoTarget, pickAutoTargets, recoverLostPointer } from "./core/track.js";

// pure selection — headless 사용자용 (React 무관). hooks/useSelection 가 이걸 wrapping.
export {
  reduceSelection,
  applySelectionAutoRules,
  EMPTY_SELECTION,
  isCollapsed as isSelectionCollapsed,
  selectionType,
} from "./core/selection/index.js";
export type { SelectionAction, SelectionSnap } from "./core/selection/index.js";
export { expandRange } from "./core/selection/range.js";

// Sidecars — 횡단 관심사 (recorder / debug-log / http)
// Session recording — 모든 commit 된 patch 를 timestamp 와 함께 직렬화 가능한 Recording 으로.
export { useRecorder, replayRecording } from "./sidecars/recorder.js";
export type { Recording, RecordedStep, RecorderApi, ReplayOptions } from "./sidecars/recorder.js";

// Debug log — 입력·dispatch·command·commit·selection·toast 모든 단계의 trace.
export { useDebugLog } from "./sidecars/debug-log.js";
export type { DebugLog, DebugEvent, DebugLogger, DebugLogApi } from "./sidecars/debug-log.js";

// HTTP transport — RFC 5789 + 6902 + 7396 (SPEC §5.11)
export {
  buildPatchRequest,
  withIfMatch,
  parsePatchResponse,
  parseMergePatch,
  applyMergePatch,
  JSON_PATCH_MIME,
  MERGE_PATCH_MIME,
} from "./sidecars/http.js";
export type { PatchRequest, ParseResult, ParseError } from "./sidecars/http.js";

// JSON Schema bridge — RFC 8927 / draft-bhutton (core/schema/)
export { toJSONSchema, fromJSONSchema } from "./core/schema/bridge.js";
