import { cloneJson } from "../../foundation/jsonClone.js";
import { orderSelectionRanges } from "./selectionOrder.js";
import type {
  JSONPoint,
  SelectionRange,
  SelectionSnap,
} from "./selectionTypes.js";
import {
  clonePoint,
  cloneRange,
  pointPath,
} from "./selectionPoint.js";
import {
  readStringForTextEdit,
  replaceSelectionText,
  uniquePointers,
  type ReplaceSelectionTextResult,
  type SelectionTextEditError,
  type SelectionTextEditOptions,
} from "./textEdit.js";

export type SelectionTextDeleteDirection = "backward" | "forward";

export interface SelectionTextDeleteOptions extends SelectionTextEditOptions {
  /** Direction used when deleting from a collapsed caret. Selected ranges ignore it. */
  direction?: SelectionTextDeleteDirection;
  /** Number of string code units to delete from a collapsed caret. Defaults to 1. */
  count?: number;
}

export type DeleteSelectionTextResult = ReplaceSelectionTextResult;

export function deleteSelectionText(
  selection: SelectionSnap,
  state: unknown,
  options: SelectionTextDeleteOptions = {},
): DeleteSelectionTextResult {
  const deleteSelection = textDeleteSelection(selection, state, options);
  if (!deleteSelection.ok) return deleteSelection;
  return replaceSelectionText(deleteSelection.selection, state, "", options);
}

function normalizeDeleteCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function textDeleteSelection(
  selection: SelectionSnap,
  state: unknown,
  options: SelectionTextDeleteOptions,
): { ok: true; selection: SelectionSnap } | SelectionTextEditError {
  const ordered = orderSelectionRanges(selection, state, options);
  if (!ordered.ok) return ordered;

  const direction = options.direction ?? "backward";
  const count = normalizeDeleteCount(options.count);
  const ranges: SelectionRange[] = [];

  for (const range of ordered.ranges) {
    if (pointPath(range.start) !== pointPath(range.end)) {
      return {
        ok: false,
        code: "multi_pointer_range",
        reason: `selection text deletion spans multiple pointers: ${pointPath(range.start)} -> ${pointPath(range.end)}`,
        pointer: pointPath(range.start),
        index: range.index,
      };
    }

    if (!range.collapsed) {
      ranges.push({ anchor: clonePoint(range.start), focus: clonePoint(range.end) });
      continue;
    }

    const pointer = pointPath(range.start);
    const value = readStringForTextEdit(state, pointer, range.index);
    if (!value.ok) return value;

    const offset = textDeleteOffset(range.start, value.value.length);
    if (offset === null) {
      return {
        ok: false,
        code: "missing_length",
        reason: `selection text deletion offset is unknown: ${pointer}`,
        pointer,
        index: range.index,
      };
    }

    const startOffset = direction === "backward" ? Math.max(0, offset - count) : offset;
    const endOffset = direction === "backward" ? offset : Math.min(value.value.length, offset + count);
    if (startOffset === endOffset) {
      return {
        ok: false,
        code: "cursor_boundary",
        reason: `selection text deletion is at ${direction === "backward" ? "start" : "end"} boundary: ${pointer}`,
        pointer,
        index: range.index,
      };
    }
    ranges.push({
      anchor: { path: pointer, offset: startOffset },
      focus: { path: pointer, offset: endOffset },
    });
  }

  return { ok: true, selection: textDeleteSelectionSnap(selection, ranges, ordered.primaryIndex) };
}

function textDeleteOffset(point: JSONPoint, length: number): number | null {
  if (typeof point === "string") return null;
  if (point.offset !== undefined) return Math.min(Math.max(Math.trunc(point.offset), 0), length);
  if (point.edge === "before") return 0;
  if (point.edge === "after") return length;
  return null;
}

function textDeleteSelectionSnap(
  base: SelectionSnap,
  selectionRanges: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
): SelectionSnap {
  const selectedPointers = uniquePointers(selectionRanges.map((range) => pointPath(range.focus)));
  const primary = selectionRanges[primaryIndex] ?? null;
  const next: SelectionSnap = {
    selectedPointers,
    selectionRanges: selectionRanges.map(cloneRange),
    primaryIndex,
    anchor: primary === null ? null : clonePoint(primary.anchor),
    focus: primary === null ? null : clonePoint(primary.focus),
  };
  return base.context === undefined ? next : { ...next, context: cloneJson(base.context) };
}
