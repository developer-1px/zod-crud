// Command 모음 barrel — keymap.ts 의 CommandId 1:1.
// 각 command 는 (ctx) → JsonResult 또는 void.
//
// 모든 mutation 후 focus·selection 은 zod-crud 자동 규칙 (SPEC §5.7 / §5.8) 에 맡긴다.
// commands 는 RFC 6902 op 만 발행한다 — focus/selection 명시 set/clear 안 한다.

export type { CommandContext } from "./commands/context.js";
export {
  insertSibling, demote, promote, remove, moveUp, moveDown,
} from "./commands/structure.js";
export { copy, cut, paste } from "./commands/clipboard-cmds.js";
export { selectAll, extendSelection } from "./commands/selection-cmds.js";
export {
  focusPrev, focusNext, focusFirst, focusLast, focusFirstChild, focusParent,
} from "./commands/focus-nav.js";
