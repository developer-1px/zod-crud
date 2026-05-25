import { cloneJson } from "../../foundation/json.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import {
  cursorPoints,
  emptyTraversalPointer,
  emptyTraversalReason,
} from "./traversal.js";
import {
  orderSelectionRanges,
} from "./selectionOrder.js";
import { selectionSpansForPointer } from "./selectionSpans.js";
import type {
  JSONPoint,
  JSONPointObject,
  SelectionAffinity,
  SelectionOrderErrorCode,
  SelectionPointerSpan,
  SelectionRange,
  SelectionSnap,
  SelectionSpanOptions,
} from "./selectionTypes.js";
import { clonePoint, pointPath } from "./selectionPoint.js";
export { clonePoint, cloneRange, pointPath } from "./selectionPoint.js";

export interface SelectionTextEditOptions extends SelectionSpanOptions {
  /** Optional affinity attached to final carets produced by text replacement helpers. */
  affinity?: SelectionAffinity;
}

export type SelectionTextEditErrorCode =
  | SelectionOrderErrorCode
  | "missing_length"
  | "multi_pointer_range"
  | "overlapping_ranges"
  | "cursor_boundary"
  | "path_not_found"
  | "not_string";

export interface SelectionTextEdit extends SelectionPointerSpan {
  startOffset: number;
  endOffset: number;
  replacement: string;
}

export interface SelectionTextEditError {
  ok: false;
  code: SelectionTextEditErrorCode;
  reason: string;
  pointer: Pointer | null;
  index: number | null;
}

export type SelectionTextEditsResult =
  | {
      ok: true;
      edits: ReadonlyArray<SelectionTextEdit>;
    }
  | SelectionTextEditError;

export type ReplaceSelectionTextResult =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selection: SelectionSnap;
      edits: ReadonlyArray<SelectionTextEdit>;
      pointers: ReadonlyArray<Pointer>;
    }
  | SelectionTextEditError;

export function selectionTextEdits(
  selection: SelectionSnap,
  state: unknown,
  replacement: string,
  options: SelectionTextEditOptions = {},
): SelectionTextEditsResult {
  const ordered = orderSelectionRanges(selection, state, options);
  if (!ordered.ok) return ordered;

  const points = cursorPoints(state, options);
  if (!points.ok) return { ...points, index: null };
  if (points.points.length === 0) {
    return {
      ok: false,
      code: "empty_scope",
      reason: emptyTraversalReason("selection", options),
      pointer: emptyTraversalPointer(options),
      index: null,
    };
  }

  const edits: SelectionTextEdit[] = [];
  const explicitOrder = options.points !== undefined || options.query !== undefined;
  for (const pointer of uniquePointPointers(points.points)) {
    if (!explicitOrder && pointerLength(pointer, state, options) === null) continue;
    const result = selectionSpansForPointer(selection, pointer, state, options);
    if (!result.ok) return result;
    for (const span of result.spans) {
      if (span.startOffset === null || span.endOffset === null) {
        return {
          ok: false,
          code: "missing_length",
          reason: `selection text edit length is unknown: ${pointer}`,
          pointer,
          index: span.rangeIndex,
        };
      }
      edits.push({
        ...span,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        replacement,
      });
    }
  }

  if (edits.length === 0) {
    return {
      ok: false,
      code: "point_not_in_order",
      reason: "selection has no editable points in comparison order",
      pointer: null,
      index: null,
    };
  }

  return { ok: true, edits };
}

export function replaceSelectionText(
  selection: SelectionSnap,
  state: unknown,
  replacement: string,
  options: SelectionTextEditOptions = {},
): ReplaceSelectionTextResult {
  const ordered = orderSelectionRanges(selection, state, options);
  if (!ordered.ok) return ordered;
  for (const range of ordered.ranges) {
    if (pointPath(range.start) !== pointPath(range.end)) {
      return {
        ok: false,
        code: "multi_pointer_range",
        reason: `selection text replacement spans multiple pointers: ${pointPath(range.start)} -> ${pointPath(range.end)}`,
        pointer: pointPath(range.start),
        index: range.index,
      };
    }
  }

  const editResult = selectionTextEdits(selection, state, replacement, options);
  if (!editResult.ok) return editResult;

  const patch: JSONPatchOperation[] = [];
  const finalOffsets = new Map<SelectionTextEdit, number>();
  for (const [pointer, edits] of groupTextEditsByPointer(editResult.edits)) {
    const value = readStringForTextEdit(state, pointer, edits[0]?.rangeIndex ?? null);
    if (!value.ok) return value;

    const orderedEdits = [...edits].sort(compareTextEditsAscending);
    for (let i = 1; i < orderedEdits.length; i += 1) {
      const previous = orderedEdits[i - 1]!;
      const current = orderedEdits[i]!;
      if (current.startOffset < previous.endOffset) {
        return {
          ok: false,
          code: "overlapping_ranges",
          reason: `selection text edits overlap: ${pointer}`,
          pointer,
          index: current.rangeIndex,
        };
      }
    }

    let delta = 0;
    for (const edit of orderedEdits) {
      finalOffsets.set(edit, edit.startOffset + delta + replacement.length);
      delta += replacement.length - (edit.endOffset - edit.startOffset);
    }

    let next = value.value;
    for (const edit of [...orderedEdits].sort(compareTextEditsDescending)) {
      next = `${next.slice(0, edit.startOffset)}${replacement}${next.slice(edit.endOffset)}`;
    }
    patch.push({ op: "replace", path: pointer, value: next });
  }

  return {
    ok: true,
    patch,
    selection: textEditSelection(selection, editResult.edits, finalOffsets, options.affinity),
    edits: editResult.edits,
    pointers: patch.map((operation) => operation.path),
  };
}

function uniquePointPointers(points: ReadonlyArray<JSONPoint>): Pointer[] {
  const out: Pointer[] = [];
  for (const point of points) {
    const pointer = pointPath(point);
    if (!out.includes(pointer)) out.push(pointer);
  }
  return out;
}

function pointerLength(pointer: Pointer, state: unknown, options: SelectionSpanOptions): number | null {
  if (options.length !== undefined) return normalizeLength(options.length);
  const value = readPointerValue(state, pointer);
  const resolved = options.getLength?.(pointer, value);
  if (resolved !== undefined && resolved !== null) return normalizeLength(resolved);
  return typeof value === "string" ? value.length : null;
}

function readPointerValue(state: unknown, pointer: Pointer): unknown {
  const segments = tryParsePointer(pointer);
  if (segments === null) return undefined;
  const value = readAt(state, segments);
  return value.ok ? value.value : undefined;
}

function normalizeLength(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function groupTextEditsByPointer(edits: ReadonlyArray<SelectionTextEdit>): Array<[Pointer, SelectionTextEdit[]]> {
  const groups = new Map<Pointer, SelectionTextEdit[]>();
  for (const edit of edits) {
    const group = groups.get(edit.pointer);
    if (group === undefined) groups.set(edit.pointer, [edit]);
    else group.push(edit);
  }
  return [...groups.entries()];
}

function compareTextEditsAscending(left: SelectionTextEdit, right: SelectionTextEdit): number {
  if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
  if (left.endOffset !== right.endOffset) return left.endOffset - right.endOffset;
  return left.rangeIndex - right.rangeIndex;
}

function compareTextEditsDescending(left: SelectionTextEdit, right: SelectionTextEdit): number {
  if (left.startOffset !== right.startOffset) return right.startOffset - left.startOffset;
  if (left.endOffset !== right.endOffset) return right.endOffset - left.endOffset;
  return right.rangeIndex - left.rangeIndex;
}

export function readStringForTextEdit(
  state: unknown,
  pointer: Pointer,
  index: number | null,
): { ok: true; value: string } | SelectionTextEditError {
  const segments = tryParsePointer(pointer);
  if (segments === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid selection text edit pointer: ${pointer}`,
      pointer,
      index,
    };
  }
  const value = readAt(state, segments);
  if (!value.ok) {
    return {
      ok: false,
      code: "path_not_found",
      reason: `selection text edit path not found: ${pointer}`,
      pointer,
      index,
    };
  }
  if (typeof value.value !== "string") {
    return {
      ok: false,
      code: "not_string",
      reason: `selection text edit target is not a string: ${pointer}`,
      pointer,
      index,
    };
  }
  return { ok: true, value: value.value };
}

function textEditSelection(
  base: SelectionSnap,
  edits: ReadonlyArray<SelectionTextEdit>,
  finalOffsets: ReadonlyMap<SelectionTextEdit, number>,
  affinity: SelectionAffinity | undefined,
): SelectionSnap {
  const selectionRanges = edits.map((edit): SelectionRange => {
    const point: JSONPointObject = {
      path: edit.pointer,
      offset: finalOffsets.get(edit) ?? edit.startOffset + edit.replacement.length,
    };
    if (affinity !== undefined) point.affinity = affinity;
    return { anchor: point, focus: { ...point } };
  });
  const primaryIndex = primaryEditIndex(edits, selectionRanges.length);
  const primary = selectionRanges[primaryIndex] ?? null;
  const selectedPointers = uniquePointers(edits.map((edit) => edit.pointer));
  const next: SelectionSnap = {
    selectedPointers,
    selectionRanges,
    primaryIndex,
    anchor: primary === null ? null : clonePoint(primary.anchor),
    focus: primary === null ? null : clonePoint(primary.focus),
  };
  return base.context === undefined ? next : { ...next, context: cloneJson(base.context) };
}

function primaryEditIndex(edits: ReadonlyArray<SelectionTextEdit>, length: number): number {
  if (length <= 0) return -1;
  const primaryIndex = edits.findIndex((edit) => edit.primary);
  return primaryIndex >= 0 ? primaryIndex : length - 1;
}

export function uniquePointers(pointers: ReadonlyArray<Pointer>): Pointer[] {
  const out: Pointer[] = [];
  for (const pointer of pointers) {
    if (!out.includes(pointer)) out.push(pointer);
  }
  return out;
}
