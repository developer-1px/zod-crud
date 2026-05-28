import type { Pointer } from "../../foundation/pointer/index.js";

type JSONPrimitive = string | number | boolean | null;

type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | ReadonlyArray<JSONValue>;

export type SelectionMode = "single" | "multiple" | "extended";
export type SelectionType = "None" | "Caret" | "Range";
export type SelectionEdge = "before" | "after";
export type SelectionAffinity = "forward" | "backward";
export type SelectionCursorDirection = "first" | "previous" | "next" | "last";
export type SelectionDirection = "forward" | "backward" | "none";
export type SelectionContext = JSONValue;
export type SelectionCursorErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "cursor_boundary";
export type SelectionScopeErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope";
export type SelectionOrderErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "syntax_error"
  | "empty_scope"
  | "point_not_in_order"
  | "empty_selection";

export interface SelectionPointObject {
  path: Pointer;
  offset?: number;
  edge?: SelectionEdge;
  affinity?: SelectionAffinity;
}

export type SelectionPoint = Pointer | SelectionPointObject;

export interface SelectionRange {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export type SelectionRangeInput = SelectionPoint | SelectionRange;
export type SelectionSource = Pointer | ReadonlyArray<Pointer>;

export interface SelectionCursorOptions {
  points?: ReadonlyArray<SelectionPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
  wrap?: boolean;
}

export interface SelectionScopeOptions {
  points?: ReadonlyArray<SelectionPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
  primaryIndex?: number;
}

export interface SelectionOrderOptions {
  points?: ReadonlyArray<SelectionPoint>;
  query?: string;
  scope?: Pointer;
  includeScope?: boolean;
}

export interface SelectionSpanOptions extends SelectionOrderOptions {
  length?: number;
  getLength?: (pointer: Pointer, value: unknown) => number | null | undefined;
}

export type SelectionCursorResult =
  | {
      ok: true;
      direction: SelectionCursorDirection;
      pointer: Pointer;
      point: SelectionPoint;
      previousPointer: Pointer | null;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      direction: SelectionCursorDirection;
      code: SelectionCursorErrorCode;
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

export type SelectionCursorTarget =
  | Omit<Extract<SelectionCursorResult, { ok: true }>, "selection">
  | Omit<Extract<SelectionCursorResult, { ok: false }>, "selection">;

export type SelectionScopeResult =
  | {
      ok: true;
      points: ReadonlyArray<SelectionPoint>;
      selection: SelectionSnap;
    }
  | {
      ok: false;
      code: SelectionScopeErrorCode;
      reason: string;
      pointer: Pointer | null;
      selection: SelectionSnap;
    };

export type SelectionScopeTarget =
  | Omit<Extract<SelectionScopeResult, { ok: true }>, "selection">
  | Omit<Extract<SelectionScopeResult, { ok: false }>, "selection">;

export type SelectionPointOrderResult =
  | {
      ok: true;
      order: -1 | 0 | 1;
      direction: SelectionDirection;
      left: SelectionPoint;
      right: SelectionPoint;
      leftPointer: Pointer;
      rightPointer: Pointer;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

export interface SelectionOrderedRange {
  anchor: SelectionPoint;
  focus: SelectionPoint;
  start: SelectionPoint;
  end: SelectionPoint;
  direction: SelectionDirection;
  collapsed: boolean;
}

export interface SelectionOrderedRangeEntry extends SelectionOrderedRange {
  index: number;
  primary: boolean;
}

export type SelectionRangeOrderResult =
  | {
      ok: true;
      range: SelectionOrderedRange;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
    };

export type SelectionRangesOrderResult =
  | {
      ok: true;
      ranges: ReadonlyArray<SelectionOrderedRangeEntry>;
      primaryIndex: number;
      primaryRange: SelectionOrderedRangeEntry | null;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
      index: number | null;
    };

export interface SelectionPointerSpan {
  pointer: Pointer;
  rangeIndex: number;
  primary: boolean;
  start: SelectionPoint;
  end: SelectionPoint;
  startOffset: number | null;
  endOffset: number | null;
  collapsed: boolean;
  full: boolean;
}

export type SelectionPointerSpansResult =
  | {
      ok: true;
      pointer: Pointer;
      spans: ReadonlyArray<SelectionPointerSpan>;
    }
  | {
      ok: false;
      code: SelectionOrderErrorCode;
      reason: string;
      pointer: Pointer | null;
      index: number | null;
    };

export interface SelectionSnap {
  selectedPointers: ReadonlyArray<Pointer>;
  selectionRanges: ReadonlyArray<SelectionRange>;
  primaryIndex: number;
  anchor: SelectionPoint | null;
  focus: SelectionPoint | null;
  context?: SelectionContext | undefined;
}

export const EMPTY_SELECTION: SelectionSnap = {
  selectedPointers: [],
  selectionRanges: [],
  primaryIndex: -1,
  anchor: null,
  focus: null,
};

type SelectionShapeAction =
  | { type: "collapse"; pointer: Pointer }
  | { type: "collapse"; point: SelectionPoint }
  | { type: "setBaseAndExtent"; anchor: SelectionPoint; focus: SelectionPoint }
  | { type: "extend"; pointer: Pointer }
  | { type: "extend"; point: SelectionPoint }
  | { type: "addRange"; pointer: Pointer }
  | { type: "addRange"; point: SelectionPoint }
  | { type: "addRange"; range: SelectionRange }
  | { type: "removeRange"; pointer: Pointer }
  | { type: "removeRange"; point: SelectionPoint }
  | { type: "removeRange"; range: SelectionRange }
  | { type: "removeRange"; index: number }
  | { type: "toggleRange"; pointer: Pointer }
  | { type: "toggleRange"; point: SelectionPoint }
  | { type: "toggleRange"; range: SelectionRange }
  | { type: "togglePointer"; pointer: Pointer }
  | {
      type: "selectRanges";
      ranges: ReadonlyArray<SelectionRangeInput>;
      anchor?: SelectionPoint | null;
      focus?: SelectionPoint | null;
      primaryIndex?: number;
    }
  | { type: "empty" };

export type SelectionAction =
  | (SelectionShapeAction & {
      context?: SelectionContext;
      clearContext?: boolean;
    })
  | { type: "setContext"; context: SelectionContext }
  | { type: "clearContext" };
