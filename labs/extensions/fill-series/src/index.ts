import {
  appendSegment,
  resolveSiblingRange,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type SiblingRangeErrorCode,
} from "zod-crud";

export type FillSeriesErrorCode =
  | "empty_target"
  | "invalid_pointer"
  | "mixed_parent"
  | "not_contiguous"
  | "path_not_found"
  | "not_array"
  | "index_out_of_range"
  | "generator_failed"
  | "patch_rejected"
  | "patch_failed";

export interface FillSeriesError {
  ok: false;
  code: FillSeriesErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A single target slot inside the contiguous fill range. */
export interface FillCell {
  /** Pointer that receives the value (item pointer, or item pointer + field). */
  pointer: Pointer;
  /** Array item pointer regardless of `field`. */
  itemPointer: Pointer;
  /** Absolute array index of the item. */
  index: number;
  /** 0-based position within the fill range. */
  offset: number;
  /** Current value at `pointer`, or `undefined` if absent. */
  current: unknown;
}

export type FillGenerator<TValue = unknown> = (cell: FillCell) => TValue;

/** Constant value, linear numeric series, or host generator. */
export type FillSource<TValue = unknown> =
  | { value: TValue }
  | { series: { step: number; start?: number } }
  | { from: FillGenerator<TValue> };

export interface FillOptions {
  /** Relative sub-pointer written inside each item, e.g. `"/qty"`. Default `""` writes the whole item. */
  field?: Pointer;
}

export interface FillSeriesChange<TValue = unknown> {
  ok: true;
  /** Parent array pointer of the filled range. */
  path: Pointer;
  /** Relative field written inside each item (`""` for the whole item). */
  field: Pointer;
  count: number;
  changed: boolean;
  /** Target write pointers in range order. */
  pointers: ReadonlyArray<Pointer>;
  /** Computed values in range order (every cell, not only changed ones). */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Item pointers in range order, for hosts that keep selection after the fill. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type FillSeriesResult<TValue = unknown> =
  | FillSeriesChange<TValue>
  | FillSeriesError;

export interface FillSeries<TDocument> {
  canFill<TValue = unknown>(
    target: ReadonlyArray<Pointer>,
    source: FillSource<TValue>,
    options?: FillOptions,
  ): FillSeriesResult<TValue>;
  fill<TValue = unknown>(
    target: ReadonlyArray<Pointer>,
    source: FillSource<TValue>,
    options?: FillOptions,
  ): FillSeriesResult<TValue>;
}

export function createFillSeries<TDocument>(
  doc: JSONDocument<TDocument>,
): FillSeries<TDocument> {
  return {
    canFill(target, source, options) {
      return canFill(doc, target, source, options);
    },
    fill(target, source, options) {
      return fill(doc, target, source, options);
    },
  };
}

export function canFill<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: ReadonlyArray<Pointer>,
  source: FillSource<TValue>,
  options?: FillOptions,
): FillSeriesResult<TValue> {
  const range = normalizeRange(target);
  if (!range.ok) return range;

  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_pointer", `field must be empty or start with '/': ${field}`, field);
  }

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return error(parentRead.code, parentRead.reason ?? `fill parent not found: ${range.parent}`, range.parent);
  }
  if (!Array.isArray(parentRead.value)) {
    return error("not_array", `fill target parent is not an array: ${range.parent}`, range.parent);
  }
  const arrayLength = parentRead.value.length;

  const cells: FillCell[] = [];
  for (let offset = 0; offset < range.indices.length; offset += 1) {
    const index = range.indices[offset] as number;
    if (index >= arrayLength) {
      return error("index_out_of_range", `array index ${index} is out of range at ${range.parent}`, range.parent);
    }
    const itemPointer = appendSegment(range.parent, index);
    const pointer = field === "" ? itemPointer : itemPointer + field;
    const read = doc.at(pointer);
    cells.push({
      pointer,
      itemPointer,
      index,
      offset,
      current: read.ok ? read.value : undefined,
    });
  }

  const computed = computeValues(source, cells);
  if (!computed.ok) return computed;
  const values = computed.values;

  const operations: JSONPatchOperation[] = [];
  for (let offset = 0; offset < cells.length; offset += 1) {
    const cell = cells[offset] as FillCell;
    const next = values[offset] as TValue;
    if (!jsonEqual(cell.current, next)) {
      operations.push({ op: "replace", path: cell.pointer, value: cloneJson(next) });
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(range.parent, capability);
  }

  return {
    ok: true,
    path: range.parent,
    field,
    count: cells.length,
    changed: operations.length > 0,
    pointers: cells.map((cell) => cell.pointer),
    values: cloneJson(values),
    operations,
    selectionAfter: cells.map((cell) => cell.itemPointer),
  };
}

export function fill<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: ReadonlyArray<Pointer>,
  source: FillSource<TValue>,
  options?: FillOptions,
): FillSeriesResult<TValue> {
  const change = canFill(doc, target, source, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

interface NormalizedRange {
  ok: true;
  parent: Pointer;
  indices: number[];
}

// Selected-sibling-range normalization is shared core (RFC #87). Map its error
// codes back to this lab's existing codes so behavior stays identical.
const FILL_ERROR_CODE: Record<SiblingRangeErrorCode, FillSeriesErrorCode> = {
  empty_selection: "empty_target",
  invalid_pointer: "invalid_pointer",
  not_array_item: "invalid_pointer",
  mixed_parent: "mixed_parent",
  non_contiguous: "not_contiguous",
};

function normalizeRange(target: ReadonlyArray<Pointer>): NormalizedRange | FillSeriesError {
  const range = resolveSiblingRange(target, { requireContiguous: true });
  if (!range.ok) return error(FILL_ERROR_CODE[range.code], range.reason, range.pointer);
  return { ok: true, parent: range.parent, indices: range.locations.map((location) => location.index) };
}

function computeValues<TValue>(
  source: FillSource<TValue>,
  cells: ReadonlyArray<FillCell>,
): { ok: true; values: TValue[] } | FillSeriesError {
  if ("value" in source) {
    return { ok: true, values: cells.map(() => cloneJson(source.value)) };
  }

  if ("series" in source) {
    const { step } = source.series;
    let start = source.series.start;
    if (start === undefined) {
      const first = cells[0]?.current;
      if (typeof first !== "number") {
        return error(
          "generator_failed",
          "series start was omitted and the first cell is not a number; pass series.start explicitly.",
          cells[0]?.pointer,
        );
      }
      start = first;
    }
    const values = cells.map((cell) => (start + cell.offset * step) as unknown as TValue);
    return { ok: true, values };
  }

  try {
    return { ok: true, values: cells.map((cell) => source.from(cell)) };
  } catch (cause) {
    return error(
      "generator_failed",
      cause instanceof Error ? cause.message : "fill generator threw.",
    );
  }
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): FillSeriesError {
  const result: FillSeriesError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `fill patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(
  pointer: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): FillSeriesError {
  const result: FillSeriesError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `fill patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: FillSeriesErrorCode, reason: string, pointer?: Pointer): FillSeriesError {
  const result: FillSeriesError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
