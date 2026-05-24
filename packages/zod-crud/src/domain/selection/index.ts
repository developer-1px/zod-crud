// SPEC §5.7 — Selection state. 정체성: "다음 명령의 작용 범위" + 캐럿 위치.

export {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
} from "./traversal.js";

export { EMPTY_SELECTION } from "./selectionTypes.js";
export type {
  JSONPoint,
  JSONPointObject,
  OrderedSelectionRange,
  OrderedSelectionRangeEntry,
  SelectionAction,
  SelectionAffinity,
  SelectionContext,
  SelectionCursorDirection,
  SelectionCursorErrorCode,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionCursorTarget,
  SelectionDirection,
  SelectionEdge,
  SelectionMode,
  SelectionOrderErrorCode,
  SelectionOrderOptions,
  SelectionPointOrderResult,
  SelectionPointerSpan,
  SelectionPointerSpansResult,
  SelectionRange,
  SelectionRangeInput,
  SelectionRangeOrderResult,
  SelectionRangesOrderResult,
  SelectionScopeErrorCode,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionScopeTarget,
  SelectionSource,
  SelectionSpanOptions,
  SelectionSnap,
  SelectionType,
} from "./selectionTypes.js";

export {
  anchorPointer,
  caretPoint,
  caretPointer,
  focusPointer,
  hasSelection,
  isCollapsed,
  isSelected,
  primaryPointer,
  primaryRange,
  rangeCount,
  restoreSelection,
  selectedCount,
  selectedSource,
  selectionSnapshot,
  selectionType,
} from "./selectionRead.js";

export {
  compareSelectionPoints,
  orderPrimarySelectionRange,
  orderSelectionRange,
  orderSelectionRanges,
  resolveSelectionScope,
  selectSelectionScope,
} from "./selectionOrder.js";

export { selectionSpansForPointer } from "./selectionSpans.js";

export {
  extendSelectionCursor,
  moveSelectionCursor,
  reduceSelection,
  resolveSelectionCursor,
} from "./selectionReducer.js";

export { applySelectionAutoRules } from "./selectionAutoRules.js";
