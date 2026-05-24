// RFC 6902 — JSON Patch. SPEC.md §3.
// Root public surface: types + applyOperation + applyPatch.

export {
  applyOperation,
  applyPatch,
  applyPatchToTrustedState,
  applySingleTrustedValuePatchToTrustedState,
} from "./applyPublic.js";

export {
  applyAcceptedPatch,
  applyTrustedPatch,
} from "./applyTrusted.js";

export type {
  ApplyResult,
  ErrorCode,
  JSONPatchOperation,
  JSONResult,
} from "./types.js";
