// Command 모음 barrel — keymap.ts 의 CommandId 1:1.
// 각 command 는 (ctx) → JSONResult 또는 void.
//
// 모든 mutation 후 focus·selection 은 zod-crud 자동 규칙 (SPEC §5.7 / §5.8) 에 맡긴다.
// commands 는 document facade verb 또는 필요한 batch patch 만 발행한다.
// focus/selection 명시 set/clear 는 하지 않는다.

export { focusOf } from "./context.js";
export type { CommandContext } from "./context.js";
export {
  insertSibling, duplicateRow, demote, promote, deleteRows, moveUp, moveDown,
} from "./structure.js";
export { copy, cut, paste } from "./clipboard.js";
export { selectAll, extendSelection } from "./selection.js";
export {
  focusPrev, focusNext, focusFirst, focusLast, focusFirstChild, focusParent,
} from "./focus.js";
