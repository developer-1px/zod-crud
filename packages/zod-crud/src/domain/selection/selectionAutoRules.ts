import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { buildPointer, isPrefix, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import { pickAutoTargetsInfo, pickPrimaryAutoTarget } from "../tracking/autoTarget.js";
import { exists, recoverLostPointer, trackPointer } from "../tracking/pointer.js";
import type {
  JSONPoint,
  SelectionMode,
  SelectionRange,
  SelectionSnap,
} from "./selectionTypes.js";
import {
  collapsedRange,
  normalizePoint,
  pointPath,
  withPointPath,
} from "./selectionPoint.js";
import {
  pushUniqueRange,
  sameSelectionSnap,
  snapFromPointerTargets,
  snapFromRanges,
  withPreviousContext,
} from "./selectionSnap.js";
import { canKeepSelectionForStableReplacePatch } from "./selectionStableReplace.js";

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
  const trackOrRecover = (p: JSONPoint | null): JSONPoint | null => {
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
