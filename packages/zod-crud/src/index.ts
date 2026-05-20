// zod-crud — public surface.
// 어휘: 편집 어휘 wrapper. 오래된 축/에디터 추상화 어휘는 쓰지 않는다.
//
// Headless entrypoint. React APIs live under `zod-crud/react` so the optional
// React peer is not required for pure JSON Patch / Pointer consumers.

// === Boundary error + ops contract ===
export { JSONCrudError } from "./JSONCrudError.js";
export type { JSONLoadOptions, JSONOps, UseJSONOptions } from "./jsonOps.js";

// === Headless document facade ===
export { createJSONDocument } from "./createJSONDocument.js";
export type {
  JSONDocument,
  JSONDocumentHistory,
  SelectionState,
  UseJSONDocumentOptions,
  UseSelectionOptions,
} from "./createJSONDocument.js";

// === RFC 6902 — JSON Patch ===
export { applyOperation, applyPatch, computeInverses } from "./core/patch/index.js";
export type {
  JSONPatchOperation,
  JSONResult,
  ErrorCode,
  ApplyResult,
} from "./core/patch/index.js";

// === RFC 6901 — JSON Pointer ===
export {
  parsePointer,
  tryParsePointer,
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
  JSONPoint,
  SelectionAffinity,
  SelectionEdge,
  SelectionMode,
  SelectionRange,
  SelectionType,
} from "./core/selection/index.js";
export { trackPointer } from "./core/track.js";
export { EMPTY_SELECTION } from "./core/selection/index.js";

// === Sidecars — 횡단 관심사 ===
// React sidecar hooks live under `zod-crud/react`.
export { replayRecording } from "./sidecars/replayRecording.js";
export type {
  RecordedStep,
  Recording,
  ReplayOptions,
} from "./sidecars/replayRecording.js";

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
export type { ParseResult, ParseError, PatchRequest } from "./sidecars/http.js";

// === Clipboard verbs ===
export {
  copy,
  toClipboardItems,
  toMarkdown,
  toTsv,
} from "./verbs/copy.js";
export type {
  ClipboardItemMap,
  ClipboardItemOptions,
  CopyError,
  CopyOk,
  CopyResult,
} from "./verbs/copy.js";
export { paste } from "./verbs/paste.js";
export type {
  PasteDuMismatch,
  PasteError,
  PasteMode,
  PasteOk,
  PasteOptions,
  RekeyContext,
  RekeyOptions,
  RekeyResult,
  RekeyStrategy,
} from "./verbs/paste.js";
export { duplicate } from "./verbs/duplicate.js";
export type {
  DuplicateError,
  DuplicateOk,
  DuplicateOpts,
} from "./verbs/duplicate.js";
export { cut } from "./verbs/cut.js";
export type { CutError, CutOk } from "./verbs/cut.js";
export { find, queryPointers } from "./verbs/find.js";
export type { FindError, FindOk } from "./verbs/find.js";
export { move } from "./verbs/move.js";
export type { MoveError, MoveOk, MoveResult } from "./verbs/move.js";
export { redo } from "./verbs/redo.js";
export type { RedoResult } from "./verbs/redo.js";
export { replace } from "./verbs/replace.js";
export type { ReplaceError, ReplaceOk } from "./verbs/replace.js";
export { select } from "./verbs/select.js";
export type { SelectionAction, SelectionSnap } from "./verbs/select.js";
export { undo } from "./verbs/undo.js";
export type { UndoEntry, UndoNoop, UndoResult } from "./verbs/undo.js";

// === JSON Schema bridge — RFC 8927 / draft-bhutton ===
export { toJSONSchema, fromJSONSchema } from "./core/schema/bridge.js";
export type { PreFlightErrorCode } from "./core/schema/preFlight.js";
