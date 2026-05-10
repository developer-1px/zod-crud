// zod-crud — canonical public surface.
// 정본: SPEC.md §5. 변경 시 SPEC.md를 먼저 갱신할 것.

export { useJson, JsonCrudError } from "./useJson.js";
export type { JsonOps, UseJsonOptions } from "./useJson.js";

export { applyOperation, applyPatch } from "./core/patch.js";
export type { JsonPatchOperation, JsonResult, ErrorCode } from "./core/patch.js";

export {
  parsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
} from "./core/pointer.js";
export type { Pointer } from "./core/pointer.js";
