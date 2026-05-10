// zod-crud — canonical public surface.
// 정본: SPEC.md §5. 변경 시 SPEC.md를 먼저 갱신할 것.

// Identity surface (SPEC §5.10) — facade
export { useJsonDocument } from "./hooks/useJsonDocument.js";
export type {
  JsonDocument,
  JsonDocumentHistory,
  UseJsonDocumentOptions,
} from "./hooks/useJsonDocument.js";

// Axis 1 — Data substrate
export { useJson, JsonCrudError } from "./hooks/useJson.js";
export type { JsonOps, UseJsonOptions, JsonChangeListener } from "./hooks/useJson.js";

export { applyOperation, applyPatch } from "./core/patch/index.js";
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

// Axis 2 — Editor abstractions (SPEC §0.2 / §5.7-§5.9)
// W3C Selection API 정합. caret = collapsed selection. 별도 focus 축 없음.
export { useSelection } from "./hooks/useSelection.js";
export type {
  SelectionMode,
  SelectionType,
  SelectionState,
  UseSelectionOptions,
} from "./hooks/useSelection.js";

export { trackPointer, trackPointers } from "./core/track.js";

// HTTP transport — RFC 5789 + 6902 + 7396 (SPEC §5.11)
export {
  buildPatchRequest,
  withIfMatch,
  parsePatchResponse,
  parseMergePatch,
  applyMergePatch,
  JSON_PATCH_MIME,
  MERGE_PATCH_MIME,
} from "./http/index.js";
export type { PatchRequest, ParseResult, ParseError } from "./http/index.js";

// JSON Schema bridge — RFC 8927 / draft-bhutton (SPEC §1.x)
export { toJSONSchema, fromJSONSchema } from "./schema/index.js";
