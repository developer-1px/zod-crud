import { cloneJson } from "../../foundation/jsonClone.js";
import { jsonEqual } from "../../foundation/jsonEqual.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import { expandRange } from "./range.js";
import {
  EMPTY_SELECTION,
  type JSONPoint,
  type SelectionContext,
  type SelectionMode,
  type SelectionRange,
  type SelectionSnap,
} from "./selectionTypes.js";
import {
  clonePoint,
  cloneRange,
  collapsedRange,
  normalizeSelectionRange,
  pointPath,
  samePoint,
  sameRange,
} from "./selectionPoint.js";

export function selectionSnapshot(s: SelectionSnap): SelectionSnap {
  const snapshot = {
    selectedPointers: [...s.selectedPointers],
    selectionRanges: s.selectionRanges.map(cloneRange),
    primaryIndex: s.primaryIndex,
    anchor: s.anchor === null ? null : clonePoint(s.anchor),
    focus: s.focus === null ? null : clonePoint(s.focus),
  };
  return s.context === undefined ? snapshot : withSelectionContext(snapshot, s.context);
}

export function restoreSelection(
  snapshot: SelectionSnap,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const snap = selectionSnapshot(snapshot);
  const restored = snap.selectionRanges.length === 0
    ? EMPTY_SELECTION
    : snapFromRanges(snap.selectionRanges, snap.primaryIndex, mode, state);
  return snap.context === undefined ? restored : withSelectionContext(restored, snap.context);
}

export function snapFromPointerTargets(
  targets: ReadonlyArray<Pointer>,
  mode: SelectionMode,
  unique = false,
): SelectionSnap {
  if (targets.length === 0) return EMPTY_SELECTION;
  if (mode === "single") {
    const target = targets[targets.length - 1]!;
    return {
      selectedPointers: [target],
      selectionRanges: [{ anchor: target, focus: target }],
      primaryIndex: 0,
      anchor: target,
      focus: target,
    };
  }

  if (unique) {
    const selectionRanges = new Array<SelectionRange>(targets.length);
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      selectionRanges[index] = { anchor: target, focus: target };
    }
    const primary = targets[targets.length - 1]!;
    return {
      selectedPointers: targets,
      selectionRanges,
      primaryIndex: selectionRanges.length - 1,
      anchor: primary,
      focus: primary,
    };
  }

  const primaryTargetIndex = targets.length - 1;
  const selectedPointers: Pointer[] = [];
  const selectionRanges: SelectionRange[] = [];
  const indexes = new Map<Pointer, number>();
  let primaryIndex = -1;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const existing = indexes.get(target);
    if (existing !== undefined) {
      if (index === primaryTargetIndex) primaryIndex = existing;
      continue;
    }

    const nextIndex = selectedPointers.length;
    indexes.set(target, nextIndex);
    selectedPointers.push(target);
    selectionRanges.push({ anchor: target, focus: target });
    if (index === primaryTargetIndex) primaryIndex = nextIndex;
  }

  if (selectionRanges.length === 0) return EMPTY_SELECTION;
  const nextPrimary = primaryIndex >= 0 ? primaryIndex : selectionRanges.length - 1;
  const primary = selectionRanges[nextPrimary]!;
  return {
    selectedPointers,
    selectionRanges,
    primaryIndex: nextPrimary,
    anchor: primary.anchor,
    focus: primary.focus,
  };
}

export function snapFromRanges(
  input: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
  mode: SelectionMode,
  state?: unknown,
): SelectionSnap {
  const normalized = normalizeRanges(input.map((range) => normalizeSelectionRange(range, state)), primaryIndex, mode);
  const selectionRanges = normalized.ranges;
  if (selectionRanges.length === 0) return EMPTY_SELECTION;
  const nextPrimary = normalized.primaryIndex;
  const primary = selectionRanges[nextPrimary]!;
  const selectedPointers = collectSelectedPointers(selectionRanges, state);
  return {
    selectedPointers,
    selectionRanges,
    primaryIndex: nextPrimary,
    anchor: primary.anchor,
    focus: primary.focus,
  };
}

export function pushUniqueRange(ranges: SelectionRange[], range: SelectionRange): void {
  if (!ranges.some((candidate) => sameRange(candidate, range))) ranges.push(range);
}

export function sameSelectionSnap(left: SelectionSnap, right: SelectionSnap): boolean {
  return left.primaryIndex === right.primaryIndex
    && samePointOrNull(left.anchor, right.anchor)
    && samePointOrNull(left.focus, right.focus)
    && sameSelectionContext(left.context, right.context)
    && left.selectedPointers.length === right.selectedPointers.length
    && left.selectedPointers.every((p, i) => p === right.selectedPointers[i])
    && left.selectionRanges.length === right.selectionRanges.length
    && left.selectionRanges.every((range, i) => sameRange(range, right.selectionRanges[i]!));
}

export function withPreviousContext(prev: SelectionSnap, next: SelectionSnap): SelectionSnap {
  return prev.context === undefined ? next : withSelectionContext(next, prev.context);
}

export function withSelectionContext(snap: SelectionSnap, context: SelectionContext | undefined): SelectionSnap {
  if (context === undefined) return withoutSelectionContext(snap);
  return { ...snap, context: cloneJson(context) };
}

export function withoutSelectionContext(snap: SelectionSnap): SelectionSnap {
  if (snap.context === undefined) return snap;
  return {
    selectedPointers: snap.selectedPointers,
    selectionRanges: snap.selectionRanges,
    primaryIndex: snap.primaryIndex,
    anchor: snap.anchor,
    focus: snap.focus,
  };
}

function normalizeRanges(
  input: ReadonlyArray<SelectionRange>,
  primaryIndex: number,
  mode: SelectionMode,
): { ranges: SelectionRange[]; primaryIndex: number } {
  if (mode === "single") {
    const ranges = input.length > 0 ? [input[input.length - 1]!] : [];
    return { ranges, primaryIndex: ranges.length > 0 ? 0 : -1 };
  }

  const originalPrimary = clampPrimaryIndex(primaryIndex, input.length);
  const ranges: SelectionRange[] = [];
  const stringRangeIndexes = new Map<string, number>();
  let nextPrimary = -1;
  for (let i = 0; i < input.length; i += 1) {
    const range = input[i]!;
    const key = stringRangeKey(range);
    const existing = key === null
      ? ranges.findIndex((candidate) => sameRange(candidate, range))
      : stringRangeIndexes.get(key) ?? -1;
    if (existing >= 0) {
      if (i === originalPrimary) nextPrimary = existing;
      continue;
    }
    if (i === originalPrimary) nextPrimary = ranges.length;
    if (key !== null) stringRangeIndexes.set(key, ranges.length);
    ranges.push(range);
  }
  return { ranges, primaryIndex: nextPrimary >= 0 ? nextPrimary : clampPrimaryIndex(originalPrimary, ranges.length) };
}

function stringRangeKey(range: SelectionRange): string | null {
  return typeof range.anchor === "string" && typeof range.focus === "string"
    ? `${range.anchor.length}:${range.anchor}${range.focus.length}:${range.focus}`
    : null;
}

function collectSelectedPointers(ranges: ReadonlyArray<SelectionRange>, state?: unknown): Pointer[] {
  const out: Pointer[] = [];
  const seen = new Set<Pointer>();
  for (const range of ranges) {
    for (const pointer of expandRange(pointPath(range.anchor), pointPath(range.focus), state)) {
      if (seen.has(pointer)) continue;
      seen.add(pointer);
      out.push(pointer);
    }
  }
  return out;
}

function clampPrimaryIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  if (!Number.isFinite(index)) return length - 1;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

function sameSelectionContext(left: SelectionContext | undefined, right: SelectionContext | undefined): boolean {
  return jsonEqual(left, right);
}

function samePointOrNull(left: JSONPoint | null, right: JSONPoint | null): boolean {
  if (left === null || right === null) return left === right;
  return samePoint(left, right);
}
