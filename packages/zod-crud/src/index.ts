// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Single facade: useJsonDocument. 10 verbs 와 state 가 한 객체에 노출.
// Headless 사용자 (외부 사용 ≥1): core/* 또는 verbs/* 직접 import.

// === Identity facade ===
export { useJsonDocument } from "./hooks/useJsonDocument.js";
export { useJsonSlice } from "./hooks/useJsonSlice.js";
export type {
  JsonDocument,
  JsonDocumentHistory,
  UseJsonDocumentOptions,
} from "./hooks/useJsonDocument.js";

// === Boundary error + ops contract ===
export { JsonCrudError } from "./JsonCrudError.js";
export type { JsonOps, UseJsonOptions } from "./jsonOps.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch, computeInverses } from "./core/patch/index.js";
export type {
  JsonPatchOperation,
  JsonResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";

// === RFC 6901 — JSON Pointer ===
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

// === JSON serialize helpers ===
export { serialize, parse, safeParse } from "./core/pointer/serialize.js";

// === Selection — W3C Selection API 정합 ===
export type {
  SelectionMode,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";
export { trackPointer } from "./core/track.js";
export { EMPTY_SELECTION } from "./core/selection/index.js";

// === Sidecars — 횡단 관심사 ===
// Session recording.
export { useRecorder, replayRecording } from "./sidecars/recorder.js";
export type { Recording } from "./sidecars/recorder.js";

// Debug log.
export { useDebugLog } from "./sidecars/debug-log.js";
export type { DebugLog, DebugLogger } from "./sidecars/debug-log.js";

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
export type { ParseResult, ParseError } from "./sidecars/http.js";

// === JSON Schema bridge — RFC 8927 / draft-bhutton ===
export { toJSONSchema, fromJSONSchema } from "./core/schema/bridge.js";
