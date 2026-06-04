import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

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

type PlannedCellInput =
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

export function createGridRange<TDocument>(doc: JSONDocument<TDocument>): GridRange<TDocument> {
  return {
    canPaste: (input, options) => canPasteGridRange(doc, input, options),
    paste: (input, options, metadata) => pasteGridRange(doc, input, options, metadata),
    canFill: (input, options) => canFillGridRange(doc, input, options),
    fill: (input, options, metadata) => fillGridRange(doc, input, options, metadata),
  };
}

export function canPasteGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangePasteInput,
  options: GridRangeOptions = {},
): GridRangeResult {
  const range = validateRange(input.range, input.bounds);
  if (!range.ok) return range;

  const matrix = validateMatrix(input.matrix, input.range);
  if (!matrix.ok) return matrix;

  const record = readRecord(doc, input.root);
  if (!record.ok) return record;

  const cells = resolveCells(input.root, input.range, input.keyForCell);
  if (!cells.ok) return cells;

  return planCells(doc, record.record, cells.cells, matrix.values.map((value) => ({ kind: "raw", value })), options, input.range);
}

export function pasteGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangePasteInput,
  options: GridRangeOptions = {},
  metadata?: JSONChangeMetadata,
): GridRangeResult {
  const change = canPasteGridRange(doc, input, options);
  if (!change.ok) return change;
  if (!change.changed) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(patched);
  return change;
}

export function canFillGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangeFillInput,
  options: GridRangeOptions = {},
): GridRangeResult {
  const sourceRange = validateRange(input.source, input.bounds);
  if (!sourceRange.ok) return sourceRange;
  const targetRange = validateRange(input.target, input.bounds);
  if (!targetRange.ok) return targetRange;

  const record = readRecord(doc, input.root);
  if (!record.ok) return record;

  const sourceCells = resolveCells(input.root, input.source, input.keyForCell);
  if (!sourceCells.ok) return sourceCells;
  const targetCells = resolveCells(input.root, input.target, input.keyForCell);
  if (!targetCells.ok) return targetCells;

  const sourceValues = readSourceCells(record.record, sourceCells.cells);
  const values = resolveFillIntents(input, sourceValues, targetCells.cells, options);
  if (!values.ok) return values;

  return planCells(doc, record.record, targetCells.cells, values.values, options, input.target);
}

export function fillGridRange<TDocument>(
  doc: JSONDocument<TDocument>,
  input: GridRangeFillInput,
  options: GridRangeOptions = {},
  metadata?: JSONChangeMetadata,
): GridRangeResult {
  const change = canFillGridRange(doc, input, options);
  if (!change.ok) return change;
  if (!change.changed) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(patched);
  return change;
}

function validateRange(range: GridRangeRect, bounds: GridRangeBounds | undefined): { ok: true } | GridRangeError {
  for (const [name, value] of Object.entries(range)) {
    if (!Number.isInteger(value)) {
      return error("invalid_range", `grid range ${name} must be an integer.`);
    }
  }
  if (range.row < 0 || range.column < 0) {
    return error("invalid_range", "grid range row and column must be non-negative.");
  }
  if (range.rowCount <= 0 || range.columnCount <= 0) {
    return error("invalid_range", "grid range rowCount and columnCount must be greater than zero.");
  }
  if (bounds?.rowCount !== undefined && range.row + range.rowCount > bounds.rowCount) {
    return error("out_of_bounds", `grid range needs rows ${range.row}..${range.row + range.rowCount - 1} but rowCount is ${bounds.rowCount}.`);
  }
  if (bounds?.columnCount !== undefined && range.column + range.columnCount > bounds.columnCount) {
    return error("out_of_bounds", `grid range needs columns ${range.column}..${range.column + range.columnCount - 1} but columnCount is ${bounds.columnCount}.`);
  }
  return { ok: true };
}

function validateMatrix(
  matrix: ReadonlyArray<ReadonlyArray<unknown>>,
  range: GridRangeRect,
): { ok: true; values: unknown[] } | GridRangeError {
  if (matrix.length === 0) {
    return error("empty_matrix", "grid-range paste matrix must contain at least one row.");
  }
  if (matrix.length !== range.rowCount) {
    return error("invalid_matrix", `grid-range matrix has ${matrix.length} row(s), but range rowCount is ${range.rowCount}.`);
  }

  const values: unknown[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    const cells = matrix[row] as ReadonlyArray<unknown>;
    if (cells.length !== range.columnCount) {
      return error("invalid_matrix", `grid-range matrix row ${row} has ${cells.length} column(s), but range columnCount is ${range.columnCount}.`);
    }
    values.push(...cells);
  }
  return { ok: true, values };
}

function readRecord<TDocument>(
  doc: JSONDocument<TDocument>,
  root: Pointer,
): { ok: true; record: Record<string, unknown> } | GridRangeError {
  const read = doc.at(root);
  if (!read.ok) {
    return error(read.code, read.reason ?? `grid-range root not found: ${root}`, read.pointer);
  }
  if (!isPlainRecord(read.value)) {
    return error("not_record", `grid-range root is not an object record: ${read.path}`, read.path);
  }
  return { ok: true, record: read.value };
}

function resolveCells(
  root: Pointer,
  range: GridRangeRect,
  keyForCell: GridRangeKeyResolver,
): { ok: true; cells: GridRangeResolvedCell[] } | GridRangeError {
  const cells: GridRangeResolvedCell[] = [];
  const seen = new Map<string, GridRangeResolvedCell>();

  for (let rowOffset = 0; rowOffset < range.rowCount; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < range.columnCount; columnOffset += 1) {
      const address: GridRangeCellAddress = {
        row: range.row + rowOffset,
        column: range.column + columnOffset,
        rowOffset,
        columnOffset,
      };
      const key = resolveKey(keyForCell, address);
      if (!key.ok) return key;

      const pointer = appendSegment(root, key.key);
      const cell: GridRangeResolvedCell = { ...address, root, key: key.key, pointer };
      const conflict = seen.get(key.key);
      if (conflict !== undefined) {
        return cellError("conflicting_cell", `grid-range key is produced by more than one cell: ${key.key}`, pointer, cell);
      }
      seen.set(key.key, cell);
      cells.push(cell);
    }
  }

  return { ok: true, cells };
}

function resolveKey(
  keyForCell: GridRangeKeyResolver,
  address: GridRangeCellAddress,
): { ok: true; key: string } | GridRangeError {
  try {
    const key = keyForCell(address);
    if (typeof key !== "string" || key.length === 0) {
      return cellError("key_failed", "grid-range keyForCell must return a non-empty string.", undefined, address);
    }
    return { ok: true, key };
  } catch (cause) {
    return cellError("key_failed", cause instanceof Error ? cause.message : "grid-range keyForCell threw.", undefined, address);
  }
}

function readSourceCells(
  record: Record<string, unknown>,
  sourceCells: ReadonlyArray<GridRangeResolvedCell>,
): GridRangeSourceCell[] {
  return sourceCells.map((cell) => {
    if (!Object.prototype.hasOwnProperty.call(record, cell.key)) {
      return {
        ...cell,
        exists: false,
        intent: { intent: "remove" },
      };
    }
    const value = cloneJson(record[cell.key]);
    return {
      ...cell,
      exists: true,
      value,
      intent: { intent: "set", value },
    };
  });
}

function resolveFillIntents(
  input: GridRangeFillInput,
  sourceCells: ReadonlyArray<GridRangeSourceCell>,
  targetCells: ReadonlyArray<GridRangeResolvedCell>,
  options: GridRangeOptions,
): { ok: true; values: PlannedCellInput[] } | GridRangeError {
  const sourceRange = cloneJson(input.source);
  const targetRange = cloneJson(input.target);
  const sourceSnapshot = cloneJson(sourceCells);
  const values: PlannedCellInput[] = [];

  for (let targetIndex = 0; targetIndex < targetCells.length; targetIndex += 1) {
    const targetCell = targetCells[targetIndex] as GridRangeResolvedCell;
    const sourceRow = targetCell.rowOffset % input.source.rowCount;
    const sourceColumn = targetCell.columnOffset % input.source.columnCount;
    const sourceIndex = sourceRow * input.source.columnCount + sourceColumn;
    const sourceCell = sourceCells[sourceIndex]!;

    if (options.generateFillIntent === undefined) {
      values.push(sourceCell.intent);
      continue;
    }

    try {
      values.push(options.generateFillIntent({
        root: input.root,
        sourceRange,
        targetRange,
        sourceCells: sourceSnapshot,
        sourceCell: cloneJson(sourceCell),
        sourceIndex,
        targetCell: cloneJson(targetCell),
        targetIndex,
      }));
    } catch (cause) {
      return cellError(
        "fill_failed",
        cause instanceof Error ? cause.message : "grid-range fill generator threw.",
        targetCell.pointer,
        targetCell,
      );
    }
  }

  return { ok: true, values };
}

function planCells<TDocument>(
  doc: JSONDocument<TDocument>,
  record: Record<string, unknown>,
  cells: ReadonlyArray<GridRangeResolvedCell>,
  rawValues: ReadonlyArray<PlannedCellInput>,
  options: GridRangeOptions,
  range: GridRangeRect,
): GridRangeResult {
  const decisions: GridRangeDecision[] = [];
  const operations: JSONPatchOperation[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index] as GridRangeResolvedCell;
    const raw = rawValues[index]!;
    const intent = toIntent(raw, cell, options);
    const hasCurrent = Object.prototype.hasOwnProperty.call(record, cell.key);

    if (intent.intent === "remove") {
      if (!hasCurrent) {
        decisions.push(decision(cell, "remove", "noop"));
        continue;
      }
      decisions.push(decision(cell, "remove", "remove", record[cell.key]));
      operations.push({ op: "remove", path: cell.pointer });
      continue;
    }

    const value = intent.value;
    if (!hasCurrent) {
      decisions.push(decision(cell, "set", "add", undefined, value));
      operations.push({ op: "add", path: cell.pointer, value: cloneJson(value) });
      continue;
    }

    const current = record[cell.key];
    if (equals(current, value, cell, options)) {
      decisions.push(decision(cell, "set", "noop", current, value));
      continue;
    }

    decisions.push(decision(cell, "set", "replace", current, value));
    operations.push({ op: "replace", path: cell.pointer, value: cloneJson(value) });
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(capability);
  }

  const added = decisions.filter((item) => item.action === "add").length;
  const replaced = decisions.filter((item) => item.action === "replace").length;
  const removed = decisions.filter((item) => item.action === "remove").length;
  const unchanged = decisions.filter((item) => item.action === "noop").length;

  return {
    ok: true,
    root: cells[0]?.root ?? "",
    range: cloneJson(range),
    count: decisions.length,
    changed: operations.length > 0,
    added,
    replaced,
    removed,
    unchanged,
    decisions: cloneJson(decisions),
    operations: cloneJson(operations),
    selectionAfter: cloneJson(cells),
  };
}

function toIntent(
  raw: PlannedCellInput,
  cell: GridRangeResolvedCell,
  options: GridRangeOptions,
): GridRangeCellIntent {
  if ("intent" in raw) return raw;
  return options.valueToIntent?.(raw.value, { ...cell, raw: raw.value }) ?? { intent: "set", value: raw.value };
}

function equals(
  current: unknown,
  next: unknown,
  cell: GridRangeResolvedCell,
  options: GridRangeOptions,
): boolean {
  return options.equals?.(current, next, cell) ?? jsonEqual(current, next);
}

function decision(
  cell: GridRangeResolvedCell,
  intent: GridRangeCellIntentKind,
  action: GridRangeCellAction,
  current?: unknown,
  value?: unknown,
): GridRangeDecision {
  const result: GridRangeDecision = { ...cell, intent, action };
  if (current !== undefined) result.current = cloneJson(current);
  if (value !== undefined) result.value = cloneJson(value);
  return result;
}

function capabilityError(capability: Exclude<JSONCapabilityResult, { ok: true }>): GridRangeError {
  const result: GridRangeError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "grid-range patch rejected",
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(patch: Extract<JSONResult, { ok: false }>): GridRangeError {
  const result: GridRangeError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "grid-range patch failed",
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: GridRangeErrorCode, reason: string, pointer?: Pointer): GridRangeError {
  const result: GridRangeError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cellError(
  code: GridRangeErrorCode,
  reason: string,
  pointer: Pointer | undefined,
  cell: GridRangeCellAddress,
): GridRangeError {
  const result = error(code, reason, pointer);
  result.cell = cell;
  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index]!;
      if (key !== rightKeys[index]) return false;
      if (!jsonEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
