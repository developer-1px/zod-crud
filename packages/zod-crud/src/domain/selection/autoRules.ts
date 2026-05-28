import type { JSONPatchOperation } from "../../foundation/patch/types.js";
import { buildPointer, isPrefix, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";
import { appendArrayIndexes, arrayElementLocation, arrayIndexValue } from "../pointer/array.js";
import { exists, recoverLostPointer, trackPointer, trackPointerFrom } from "../pointer/track.js";
import type {
  SelectionPoint,
  SelectionMode,
  SelectionRange,
  SelectionSnap,
} from "./types.js";
import {
  collapsedRange,
  normalizePoint,
  pointPath,
  withPointPath,
} from "./point.js";
import {
  pushUniqueRange,
  sameSelectionSnap,
  snapFromPointerTargets,
  snapFromRanges,
  withPreviousContext,
} from "./snap.js";

const MOVE_BUCKET_TARGET_THRESHOLD = 1024;

export interface AutoTargetResult {
  targets: Pointer[];
  unique: boolean;
}

export function applySelectionAutoRules(
  prev: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
  after: unknown,
  mode: SelectionMode,
): SelectionSnap {
  let hasAutoTargetOpValue: boolean | undefined;
  const hasAutoTargetOp = (): boolean => {
    if (hasAutoTargetOpValue !== undefined) return hasAutoTargetOpValue;
    for (let index = 0; index < applied.length; index += 1) {
      const op = applied[index]!;
      if ((op.op === "add" || op.op === "copy" || op.op === "move") && op.path !== "") {
        hasAutoTargetOpValue = true;
        return true;
      }
    }
    hasAutoTargetOpValue = false;
    return false;
  };
  if (hasAutoTargetOp()) {
    if (mode === "single") {
      const target = pickPrimaryAutoTarget(applied, after);
      if (target !== null) return withPreviousContext(prev, snapFromRanges([collapsedRange(target)], 0, mode, after));
    }
    const autoTargets = pickAutoTargetsInfo(applied);
    if (autoTargets.targets.length > 0) {
      return withPreviousContext(prev, snapFromPointerTargets(autoTargets.targets, mode, autoTargets.unique));
    }
  }
  if (canKeepSelectionForStableReplacePatch(prev, applied)) return prev;

  let stableReplacementPaths: ReadonlyArray<ReadonlyArray<string>> | null | false | undefined;
  let stableReplacementPathPointers: ReadonlyArray<Pointer> | null | false | undefined;
  let stableReplacementPointers: ReadonlySet<Pointer> | null | false | undefined;
  const getStableReplacementPaths = (): ReadonlyArray<ReadonlyArray<string>> | null | false => {
    if (stableReplacementPaths !== undefined) return stableReplacementPaths;
    const paths: string[][] = [];
    const pathPointers: Pointer[] = [];
    for (let index = 0; index < applied.length; index += 1) {
      const op = applied[index]!;
      if (op.op === "test") continue;
      if (op.op !== "replace") {
        stableReplacementPathPointers = false;
        return stableReplacementPaths = false;
      }
      const replaced = tryParsePointer(op.path);
      if (replaced === null) {
        stableReplacementPathPointers = null;
        return stableReplacementPaths = null;
      }
      paths.push(replaced);
      pathPointers.push(op.path[0] === "#" ? buildPointer(replaced) : op.path);
    }
    stableReplacementPathPointers = pathPointers;
    return stableReplacementPaths = paths;
  };
  const getStableReplacementPointers = (): ReadonlySet<Pointer> | null | false => {
    if (stableReplacementPointers !== undefined) return stableReplacementPointers;
    const paths = getStableReplacementPaths();
    if (paths === false || paths === null) return stableReplacementPointers = paths;
    const pathPointers = stableReplacementPathPointers as ReadonlyArray<Pointer>;
    const pointers = new Set<Pointer>();
    for (let index = 0; index < pathPointers.length; index += 1) pointers.add(pathPointers[index]!);
    return stableReplacementPointers = pointers;
  };
  const trackStableReplacementPathByScan = (
    path: Pointer,
    replacements: ReadonlyArray<ReadonlyArray<string>>,
  ): Pointer | null => {
    const target = tryParsePointer(path);
    if (target === null) return null;
    for (let index = 0; index < replacements.length; index += 1) {
      const replaced = replacements[index]!;
      if (isPrefix(replaced, target) && replaced.length < target.length) return null;
    }
    return path;
  };
  const trackStableReplacementPathBySet = (
    path: Pointer,
    replacements: ReadonlySet<Pointer>,
  ): Pointer | null => {
    if (path === "") return path;
    if (path[0] === "/") {
      if (replacements.has("")) return null;
      let slash = path.indexOf("/", 1);
      while (slash !== -1) {
        if (replacements.has(path.slice(0, slash))) return null;
        slash = path.indexOf("/", slash + 1);
      }
      return path;
    }

    const target = tryParsePointer(path);
    if (target === null) return null;
    if (replacements.has("")) return null;
    for (let length = 1; length < target.length; length += 1) {
      if (replacements.has(buildPointer(target.slice(0, length)))) return null;
    }
    return path;
  };
  let trackedPathCache: Map<Pointer, Pointer | null> | null = null;
  const trackOrRecoverPath = (path: Pointer): Pointer | null => {
    if (trackedPathCache?.has(path)) return trackedPathCache.get(path) ?? null;
    let tracked: Pointer | null;
    if (prev.selectedPointers.length > 1 || prev.selectionRanges.length > 1) {
      const replacements = getStableReplacementPointers();
      tracked = replacements === false
        ? trackPointer(path, applied)
        : replacements === null
          ? null
          : trackStableReplacementPathBySet(path, replacements);
    } else {
      const replacements = getStableReplacementPaths();
      tracked = replacements === false
        ? trackPointer(path, applied)
        : replacements === null
          ? null
          : trackStableReplacementPathByScan(path, replacements);
    }
    const next = tracked !== null && exists(after, tracked)
      ? tracked
      : recoverLostPointer(path, applied, after);
    (trackedPathCache ??= new Map()).set(path, next);
    return next;
  };
  const trackOrRecover = (p: SelectionPoint | null): SelectionPoint | null => {
    if (p === null) return null;
    const path = pointPath(p);
    const tracked = trackOrRecoverPath(path);
    return tracked === null ? null : withPointPath(p, tracked);
  };

  const nextRanges: SelectionRange[] = [];
  for (const range of prev.selectionRanges) {
    const anchor = trackOrRecover(range.anchor);
    const focus = trackOrRecover(range.focus);
    if (anchor !== null && focus !== null) pushUniqueRange(nextRanges, { anchor, focus });
    else if (anchor !== null || focus !== null) pushUniqueRange(nextRanges, collapsedRange(anchor ?? focus!));
  }
  const nextAnchor = trackOrRecover(prev.anchor);
  const nextFocus = trackOrRecover(prev.focus);
  const next = snapFromRanges(nextRanges, prev.primaryIndex, mode, after);
  const normalized = nextAnchor !== null && nextFocus !== null
    ? { ...next, anchor: normalizePoint(nextAnchor, after), focus: normalizePoint(nextFocus, after) }
    : next;
  const withContext = withPreviousContext(prev, normalized);
  return sameSelectionSnap(prev, withContext) ? prev : withContext;
}

export function pickAutoTargetsInfo(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult {
  const sameArray = pickSameArrayAutoTargets(applied);
  if (sameArray !== null) return sameArray;

  const out: Pointer[] = [];
  for (let i = 0; i < applied.length; i++) {
    const op = applied[i]!;
    if (op.op !== "add" && op.op !== "copy" && op.op !== "move") continue;
    if (op.path === "") continue;
    const tracked = trackPointerFrom(op.path, applied, i + 1);
    if (tracked !== null) out.push(tracked);
  }
  return { targets: out, unique: false };
}

export function pickPrimaryAutoTarget(
  applied: ReadonlyArray<JSONPatchOperation>,
  _after: unknown,
): Pointer | null {
  for (let i = applied.length - 1; i >= 0; i -= 1) {
    const op = applied[i]!;
    if (op.op !== "add" && op.op !== "copy" && op.op !== "move") continue;
    if (op.path === "") continue;
    return trackPointerFrom(op.path, applied, i + 1);
  }
  return null;
}

function pickSameArrayAutoTargets(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult | null {
  const monotonicInsertTargets = pickMonotonicInsertAutoTargets(applied);
  if (monotonicInsertTargets !== null) return monotonicInsertTargets;

  let parent: Pointer | null = null;
  let increasingInsertTargets: number[] | null = [];
  let previousInsertTarget = -1;
  const targets: number[] = [];
  let targetBuckets: Map<number, number[]> | null = null;

  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op !== "add" && op.op !== "remove" && op.op !== "copy" && op.op !== "move") return null;

    const location = arrayElementLocation(op.path);
    if (location === null) return null;
    if (parent === null) parent = location.parent;
    else if (location.parent !== parent) return null;

    if (op.op === "add" || op.op === "copy") {
      if (increasingInsertTargets !== null) {
        if (location.index > previousInsertTarget) {
          increasingInsertTargets.push(location.index);
          previousInsertTarget = location.index;
          continue;
        } else {
          targets.push(...increasingInsertTargets);
          increasingInsertTargets = null;
        }
      }
      shiftTargetsForInsert(targets, location.index);
      targetBuckets = null;
      targets.push(location.index);
    } else if (op.op === "remove") {
      if (increasingInsertTargets !== null) {
        targets.push(...increasingInsertTargets);
      }
      increasingInsertTargets = null;
      removeTargetIndex(targets, location.index);
      targetBuckets = null;
    } else {
      if (increasingInsertTargets !== null) {
        targets.push(...increasingInsertTargets);
      }
      increasingInsertTargets = null;
      const from = arrayElementLocation(op.from);
      if (from === null || from.parent !== parent) return null;
      if (targetBuckets !== null || shouldUseMoveBuckets(targets, from.index, location.index)) {
        targetBuckets ??= buildTargetBuckets(targets);
        shiftTargetsForMove(targets, from.index, location.index, targetBuckets);
        appendTargetBucket(targetBuckets, location.index, targets.length);
      } else {
        shiftTargetsForMoveLinear(targets, from.index, location.index);
      }
      targets.push(location.index);
    }
  }

  if (parent === null) return { targets: [], unique: true };
  const indexes = increasingInsertTargets ?? targets;
  return {
    targets: appendArrayIndexes(parent, indexes),
    unique: indexes === increasingInsertTargets,
  };
}

function pickMonotonicInsertAutoTargets(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult | null {
  let parent: Pointer | null = null;
  let prefixText: Pointer | null = null;
  let previousIndex = -1;
  let increasing = true;
  let nonIncreasing = true;
  let indexes: number[] | null = null;
  const paths = new Array<Pointer>(applied.length);

  for (let opIndex = 0; opIndex < applied.length; opIndex += 1) {
    const op = applied[opIndex]!;
    if (op.op !== "add" && op.op !== "copy") return null;

    let targetIndex: number;
    if (prefixText === null) {
      const location = arrayElementLocation(op.path);
      if (location === null) return null;
      parent = location.parent;
      prefixText = arrayElementPrefixText(parent);
      targetIndex = location.index;
    } else {
      const knownIndex = parseKnownArrayElementIndex(op.path, prefixText);
      if (knownIndex === null) return null;
      targetIndex = knownIndex;
    }

    if (opIndex > 0) {
      if (targetIndex <= previousIndex) {
        increasing = false;
        indexes ??= backfillAutoTargetIndexes(paths, opIndex);
      }
      if (targetIndex > previousIndex) nonIncreasing = false;
    }
    if (indexes !== null) indexes[opIndex] = targetIndex;
    paths[opIndex] = op.path;
    previousIndex = targetIndex;
  }

  if (parent === null) return { targets: [], unique: true };
  if (increasing) {
    return { targets: paths, unique: true };
  }
  if (!nonIncreasing || indexes === null) return null;

  const finalIndexes = new Array<number>(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) {
    finalIndexes[index] = indexes[index]! + indexes.length - index - 1;
  }
  return { targets: appendArrayIndexes(parent, finalIndexes), unique: true };
}

function arrayElementPrefixText(parent: Pointer): Pointer {
  return parent === "" ? "/" : `${parent}/`;
}

function parseKnownArrayElementIndex(path: Pointer, prefixText: Pointer): number | null {
  if (!path.startsWith(prefixText)) return null;
  const indexText = path.slice(prefixText.length);
  return indexText.includes("/") ? null : arrayIndexValue(indexText);
}

function backfillAutoTargetIndexes(paths: ReadonlyArray<Pointer>, end: number): number[] {
  const indexes = new Array<number>(paths.length);
  for (let index = 0; index < end; index += 1) {
    const location = arrayElementLocation(paths[index]!);
    indexes[index] = location?.index ?? -1;
  }
  return indexes;
}

function shiftTargetsForInsert(targets: number[], index: number): void {
  for (let target = 0; target < targets.length; target += 1) {
    if (targets[target]! >= index) targets[target]! += 1;
  }
}

function removeTargetIndex(targets: number[], index: number): void {
  let write = 0;
  for (let read = 0; read < targets.length; read += 1) {
    const target = targets[read]!;
    if (target === index) continue;
    targets[write] = target > index ? target - 1 : target;
    write += 1;
  }
  targets.length = write;
}

function shiftTargetsForMoveLinear(targets: number[], from: number, to: number): void {
  if (from === to) return;
  for (let target = 0; target < targets.length; target += 1) {
    let index = targets[target]!;
    if (index === from) {
      targets[target] = to;
      continue;
    }
    if (index > from) index -= 1;
    if (index >= to) index += 1;
    targets[target] = index;
  }
}

function shouldUseMoveBuckets(targets: ReadonlyArray<number>, from: number, to: number): boolean {
  return targets.length >= MOVE_BUCKET_TARGET_THRESHOLD
    && Math.abs(from - to) + 1 <= targets.length;
}

function shiftTargetsForMove(
  targets: number[],
  from: number,
  to: number,
  buckets: Map<number, number[]>,
): void {
  if (from === to) return;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (end - start + 1 > targets.length) {
    shiftTargetsForMoveLinear(targets, from, to);
    rebuildTargetBuckets(buckets, targets);
    return;
  }
  const affected: Array<{ index: number; nextIndex: number; positions: number[] }> = [];

  for (let index = start; index <= end; index += 1) {
    const positions = buckets.get(index);
    if (positions === undefined) continue;
    affected.push({
      index,
      nextIndex: nextMoveIndex(index, from, to),
      positions,
    });
  }

  for (const item of affected) {
    buckets.delete(item.index);
  }
  for (const item of affected) {
    for (const position of item.positions) {
      targets[position] = item.nextIndex;
    }
    buckets.set(item.nextIndex, item.positions);
  }
}

function nextMoveIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  return from < to ? index - 1 : index + 1;
}

function buildTargetBuckets(targets: ReadonlyArray<number>): Map<number, number[]> {
  const buckets = new Map<number, number[]>();
  for (let position = 0; position < targets.length; position += 1) {
    appendTargetBucket(buckets, targets[position]!, position);
  }
  return buckets;
}

function rebuildTargetBuckets(
  buckets: Map<number, number[]>,
  targets: ReadonlyArray<number>,
): void {
  buckets.clear();
  for (let position = 0; position < targets.length; position += 1) {
    appendTargetBucket(buckets, targets[position]!, position);
  }
}

function appendTargetBucket(
  buckets: Map<number, number[]>,
  index: number,
  position: number,
): void {
  const positions = buckets.get(index);
  if (positions === undefined) buckets.set(index, [position]);
  else positions.push(position);
}

function canKeepSelectionForStableReplacePatch(
  selection: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
): boolean {
  const quick = canKeepSmallStringSelectionForStableReplacePatch(selection, applied);
  if (quick !== null) return quick;

  const stringSelection = canKeepStringSelectionForStableReplacePatch(selection, applied);
  if (stringSelection !== null) return stringSelection;

  const replacements = stableReplacementPointerSet(applied);
  if (replacements === null) return false;
  if (replacements.size === 0) return true;

  for (const pointer of selection.selectedPointers) {
    if (hasStrictReplacementAncestor(pointer, replacements)) return false;
  }
  for (const range of selection.selectionRanges) {
    if (
      pointHasStrictReplacementAncestor(range.anchor, replacements)
      || pointHasStrictReplacementAncestor(range.focus, replacements)
    ) {
      return false;
    }
  }
  return !pointHasStrictReplacementAncestor(selection.anchor, replacements)
    && !pointHasStrictReplacementAncestor(selection.focus, replacements);
}

function canKeepSmallStringSelectionForStableReplacePatch(
  selection: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
): boolean | null {
  const targets = smallStringSelectionTargets(selection);
  if (targets === null) return null;

  let sawReplacement = false;
  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op === "test") continue;
    if (op.op !== "replace" || typeof op.path !== "string") return false;
    const replacement = op.path[0] === "#" ? null : op.path;
    if (replacement === null || !isFastPointerText(replacement)) return null;
    sawReplacement = true;
    for (const target of targets) {
      if (isStrictPointerPrefix(replacement, target)) return false;
    }
  }
  return sawReplacement || applied.length === 0;
}

function smallStringSelectionTargets(selection: SelectionSnap): Pointer[] | null {
  const targets: Pointer[] = [];
  const add = (point: SelectionPoint | null): boolean => {
    if (point === null) return true;
    if (typeof point !== "string") return false;
    if (!isFastPointerText(point)) return false;
    if (!targets.includes(point)) targets.push(point);
    return targets.length <= 8;
  };

  for (const pointer of selection.selectedPointers) {
    if (!add(pointer)) return null;
  }
  for (const range of selection.selectionRanges) {
    if (!add(range.anchor) || !add(range.focus)) return null;
  }
  return add(selection.anchor) && add(selection.focus) ? targets : null;
}

function canKeepStringSelectionForStableReplacePatch(
  selection: SelectionSnap,
  applied: ReadonlyArray<JSONPatchOperation>,
): boolean | null {
  const ancestors = stringSelectionAncestorSet(selection, 4096);
  if (ancestors === null) return null;

  let sawReplacement = false;
  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op === "test") continue;
    if (op.op !== "replace" || typeof op.path !== "string") return false;
    const replacement = op.path[0] === "#" ? null : op.path;
    if (replacement === null || !isFastPointerText(replacement)) return null;
    sawReplacement = true;
    if (ancestors.has(replacement)) return false;
  }
  return sawReplacement || applied.length === 0;
}

function stringSelectionAncestorSet(selection: SelectionSnap, maxAncestors: number): Set<Pointer> | null {
  const ancestors = new Set<Pointer>();
  const add = (point: SelectionPoint | null): boolean => {
    if (point === null) return true;
    if (typeof point !== "string" || !isFastPointerText(point)) return false;
    addStrictPointerAncestors(point, ancestors);
    return ancestors.size <= maxAncestors;
  };

  for (const pointer of selection.selectedPointers) {
    if (!add(pointer)) return null;
  }
  for (const range of selection.selectionRanges) {
    if (!add(range.anchor) || !add(range.focus)) return null;
  }
  return add(selection.anchor) && add(selection.focus) ? ancestors : null;
}

function addStrictPointerAncestors(pointer: Pointer, ancestors: Set<Pointer>): void {
  if (pointer === "") return;
  ancestors.add("");
  let slash = pointer.indexOf("/", 1);
  while (slash !== -1) {
    ancestors.add(pointer.slice(0, slash));
    slash = pointer.indexOf("/", slash + 1);
  }
}

function isFastPointerText(pointer: Pointer): boolean {
  if (pointer === "") return true;
  if (pointer[0] !== "/") return false;
  for (let index = pointer.indexOf("~"); index !== -1; index = pointer.indexOf("~", index + 1)) {
    const next = pointer[index + 1];
    if (next !== "0" && next !== "1") return false;
  }
  return true;
}

function isStrictPointerPrefix(prefix: Pointer, pointer: Pointer): boolean {
  return prefix === ""
    ? pointer !== ""
    : pointer.length > prefix.length
      && pointer.startsWith(prefix)
      && pointer[prefix.length] === "/";
}

function stableReplacementPointerSet(
  applied: ReadonlyArray<JSONPatchOperation>,
): Set<Pointer> | null {
  const replacements = new Set<Pointer>();
  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op === "test") continue;
    if (op.op !== "replace") return null;
    const segments = tryParsePointer(op.path);
    if (segments === null) return null;
    replacements.add(op.path[0] === "#" ? buildPointer(segments) : op.path);
  }
  return replacements;
}

function pointHasStrictReplacementAncestor(
  point: SelectionPoint | null,
  replacements: ReadonlySet<Pointer>,
): boolean {
  if (point === null) return false;
  if (typeof point !== "string") return true;
  return hasStrictReplacementAncestor(point, replacements);
}

function hasStrictReplacementAncestor(
  pointer: Pointer,
  replacements: ReadonlySet<Pointer>,
): boolean {
  if (pointer === "") return false;
  if (pointer[0] !== "/") return true;
  if (replacements.has("")) return true;

  let slash = pointer.indexOf("/", 1);
  while (slash !== -1) {
    if (replacements.has(pointer.slice(0, slash))) return true;
    slash = pointer.indexOf("/", slash + 1);
  }
  return false;
}
