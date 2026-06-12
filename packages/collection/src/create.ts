import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  canDeleteItems,
  deleteItems,
} from "./delete.js";
import {
  canDuplicateAfter,
  duplicateAfter,
} from "./duplicate.js";
import {
  applyMovePlan,
  canApplyMovePlan,
  planMoveByOffset,
  planRelativeMove,
} from "./move.js";
import type {
  Collection,
} from "./types.js";

export function createCollection<T>(doc: JSONDocument<T>): Collection<T> {
  return {
    canMoveUp: (pointer) => canApplyMovePlan(doc, planMoveByOffset(doc, pointer, -1)),
    moveUp: (pointer) => applyMovePlan(doc, planMoveByOffset(doc, pointer, -1)),
    canMoveDown: (pointer) => canApplyMovePlan(doc, planMoveByOffset(doc, pointer, 1)),
    moveDown: (pointer) => applyMovePlan(doc, planMoveByOffset(doc, pointer, 1)),
    canMoveBefore: (source, target) => canApplyMovePlan(doc, planRelativeMove(doc, source, target, "before")),
    moveBefore: (source, target) => applyMovePlan(doc, planRelativeMove(doc, source, target, "before")),
    canMoveAfter: (source, target) => canApplyMovePlan(doc, planRelativeMove(doc, source, target, "after")),
    moveAfter: (source, target) => applyMovePlan(doc, planRelativeMove(doc, source, target, "after")),
    canDuplicateAfter: (pointer, options) => canDuplicateAfter(doc, pointer, options),
    duplicateAfter: (pointer, options) => duplicateAfter(doc, pointer, options),
    canDeleteItems: (source) => canDeleteItems(doc, source),
    deleteItems: (source) => deleteItems(doc, source),
  };
}
