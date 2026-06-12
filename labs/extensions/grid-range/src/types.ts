import type { JSONCapabilityResult, JSONChangeMetadata, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type GridRangeErrorCode =
  | "empty_matrix"
  | "invalid_matrix"
  | "invalid_range"
  | "invalid_pointer"
  | "out_of_bounds"
  | "path_not_found"
  | "not_record"
  | "key_failed"
  | "fill_failed"
  | "conflicting_cell"
  | "patch_rejected"
  | "patch_failed";

export interface GridRangeError {
  ok: false;
  code: GridRangeErrorCode;
  reason: string;
  pointer?: Pointer;
  cell?: GridRangeCellAddress;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface GridRangeRect {
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
}

export interface GridRangeBounds {
  rowCount?: number;
  columnCount?: number;
}

export interface GridRangeCellAddress {
  row: number;
  column: number;
  rowOffset: number;
  columnOffset: number;
}

export interface GridRangeResolvedCell extends GridRangeCellAddress {
  root: Pointer;
  key: string;
  pointer: Pointer;
}

export type GridRangeKeyResolver = (cell: GridRangeCellAddress) => string;

export type GridRangeCellIntent =
  | { intent: "set"; value: unknown }
  | { intent: "remove" };

export type GridRangeCellAction = "add" | "replace" | "remove" | "noop";

export type GridRangeCellIntentKind = GridRangeCellIntent["intent"];

export type PlannedCellInput =
  | { kind: "raw"; value: unknown }
  | GridRangeCellIntent;

export interface GridRangeDecision extends GridRangeResolvedCell {
  intent: GridRangeCellIntentKind;
  action: GridRangeCellAction;
  current?: unknown;
  value?: unknown;
}

export interface GridRangeEqualityContext extends GridRangeResolvedCell {}

export interface GridRangeIntentContext extends GridRangeResolvedCell {
  raw: unknown;
}

export interface GridRangeSourceCell extends GridRangeResolvedCell {
  exists: boolean;
  intent: GridRangeCellIntent;
  value?: unknown;
}

export interface GridRangeFillContext {
  root: Pointer;
  sourceRange: GridRangeRect;
  targetRange: GridRangeRect;
  sourceCells: ReadonlyArray<GridRangeSourceCell>;
  sourceCell: GridRangeSourceCell;
  sourceIndex: number;
  targetCell: GridRangeResolvedCell;
  targetIndex: number;
}

export type GridRangeFillGenerator = (cell: GridRangeFillContext) => GridRangeCellIntent;

export interface GridRangeOptions {
  valueToIntent?: (value: unknown, cell: GridRangeIntentContext) => GridRangeCellIntent;
  generateFillIntent?: GridRangeFillGenerator;
  equals?: (current: unknown, next: unknown, cell: GridRangeEqualityContext) => boolean;
}

export interface GridRangePasteInput {
  root: Pointer;
  range: GridRangeRect;
  matrix: ReadonlyArray<ReadonlyArray<unknown>>;
  keyForCell: GridRangeKeyResolver;
  bounds?: GridRangeBounds;
}

export interface GridRangeFillInput {
  root: Pointer;
  source: GridRangeRect;
  target: GridRangeRect;
  keyForCell: GridRangeKeyResolver;
  bounds?: GridRangeBounds;
}

export interface GridRangeChange {
  ok: true;
  root: Pointer;
  range: GridRangeRect;
  count: number;
  changed: boolean;
  added: number;
  replaced: number;
  removed: number;
  unchanged: number;
  decisions: ReadonlyArray<GridRangeDecision>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<GridRangeResolvedCell>;
}

export type GridRangeResult = GridRangeChange | GridRangeError;

export interface GridRange<TDocument> {
  canPaste(input: GridRangePasteInput, options?: GridRangeOptions): GridRangeResult;
  paste(input: GridRangePasteInput, options?: GridRangeOptions, metadata?: JSONChangeMetadata): GridRangeResult;
  canFill(input: GridRangeFillInput, options?: GridRangeOptions): GridRangeResult;
  fill(input: GridRangeFillInput, options?: GridRangeOptions, metadata?: JSONChangeMetadata): GridRangeResult;
}
