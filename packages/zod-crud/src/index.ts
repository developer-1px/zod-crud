// zod-crud — canonical public surface.
// 정본: SPEC.md §5. 변경 시 SPEC.md를 먼저 갱신할 것.
// 어휘: ADR-0002 — 편집 어휘 wrapper. Axis 1/2 / "Editor abstractions" 어휘 폐기.
//
// Single facade: useJsonDocument. 10 verbs 와 state 가 한 객체에 노출.
// Headless 사용자: core/* + verbs/* pure 함수 직접 import.

// Identity facade — useJsonDocument (단일 진입점)
export { useJsonDocument } from "./hooks/useJsonDocument.js";
export type {
  JsonDocument,
  JsonDocumentHistory,
  UseJsonDocumentOptions,
} from "./hooks/useJsonDocument.js";

// Data substrate types — useJsonDocument.ops 의 type. JsonCrudError 도 boundary 표면.
// (useJson 자체는 public surface 에서 제외 — useJsonDocument 가 facade. P7.)
export { JsonCrudError } from "./hooks/useJson.js";
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

// Selection types — useJsonDocument.selection 의 type. (useSelection hook 자체는
// public surface 에서 제외 — useJsonDocument 가 facade. P7.)
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

// core/schema/preFlight — patch 적용 전 schema gate (P4.2)
export { preFlight } from "./core/schema/preFlight.js";
export type { PreFlightOk, PreFlightErr, PreFlightResult } from "./core/schema/preFlight.js";

// core/schema/validate — dev-only post-commit assertion (P4.3)
export { validate as validateState } from "./core/schema/validate.js";
export type { ValidateOk, ValidateErr, ValidateResult } from "./core/schema/validate.js";

// core/history — pure undo/redo stack (P2)
export {
  emptyHistory,
  commit as historyCommit,
  back as historyBack,
  forward as historyForward,
  mergeLast as historyMergeLast,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  clear as historyClear,
} from "./core/history/stack.js";
export type { HistoryStack } from "./core/history/stack.js";

// verbs/ — 편집 어휘 composer (pure, headless 사용자용)
// hooks/useJsonDocument 가 selection-aware sugar 로 wrapping (P3.5).
export { select as selectVerb, trackSelection } from "./verbs/select.js";
export { move as moveVerb } from "./verbs/move.js";
export type { MoveResult, MoveError } from "./verbs/move.js";
export { undo as undoVerb } from "./verbs/undo.js";
export type { UndoEntry, UndoResult, UndoNoop } from "./verbs/undo.js";
export { redo as redoVerb } from "./verbs/redo.js";
export type { RedoResult } from "./verbs/redo.js";

// core/jsonpath — RFC 9535 (P6.1~P6.4)
export { parse as parseJsonPath, evaluate as evaluateJsonPath, query as queryJsonPath, queryMatches as queryJsonPathMatches, JSONPathSyntaxError } from "./core/jsonpath/index.js";
export type { Query as JSONPathQuery, Match as JSONPathMatch } from "./core/jsonpath/index.js";

// Selection 기둥 verbs — find (P6.6)
export { find as findVerb } from "./verbs/find.js";
export type { FindOk, FindError } from "./verbs/find.js";

// Edit 기둥 verbs — replace (P6.7)
export { replace as replaceVerb } from "./verbs/replace.js";
export type { ReplaceOk, ReplaceError } from "./verbs/replace.js";

// Clipboard 기둥 verbs (P5)
export { copy as copyVerb } from "./verbs/copy.js";
export type { CopyOk, CopyError, CopyResult } from "./verbs/copy.js";
export { cut as cutVerb } from "./verbs/cut.js";
export type { CutOk, CutError } from "./verbs/cut.js";
export { paste as pasteVerb } from "./verbs/paste.js";
export type { PasteOk, PasteError, PasteMode } from "./verbs/paste.js";
export { duplicate as duplicateVerb } from "./verbs/duplicate.js";
export type { DuplicateOk, DuplicateError, DuplicateOpts } from "./verbs/duplicate.js";
