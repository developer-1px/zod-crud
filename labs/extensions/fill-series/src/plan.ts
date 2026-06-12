import { appendSegment, type JSONDocument, type JSONPatchOperation, type Pointer, resolveSiblingRange, type SiblingRangeErrorCode } from "@interactive-os/json-document";
import type { FillCell, FillOptions, FillSeriesError, FillSeriesErrorCode, FillSeriesResult, FillSource, NormalizedRange } from "./types.js";

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
    if (JSON.stringify(cell.current) !== JSON.stringify(next)) {
      operations.push({ op: "replace", path: cell.pointer, value: cloneJson(next) });
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `fill patch rejected at ${range.parent}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
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

function error(code: FillSeriesErrorCode, reason: string, pointer?: Pointer): FillSeriesError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
