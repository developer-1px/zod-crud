export { createOutline } from "./create.js";
export { readOutline } from "./read.js";
export {
  canDemoteOutline,
  canPromoteOutline,
  demoteOutline,
  promoteOutline,
} from "./move.js";
export type {
  Outline,
  OutlineEditChange,
  OutlineEditChangeResult,
  OutlineEditError,
  OutlineEditErrorCode,
  OutlineEditResult,
  OutlineError,
  OutlineErrorCode,
  OutlineNode,
  OutlineResult,
  OutlineSource,
  OutlineStructureOptions,
  OutlineTreeOptions,
} from "./types.js";
