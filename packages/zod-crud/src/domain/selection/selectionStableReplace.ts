import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { buildPointer, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import type { JSONPoint, SelectionSnap } from "./selectionTypes.js";

export function canKeepSelectionForStableReplacePatch(
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
  const add = (point: JSONPoint | null): boolean => {
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
  const add = (point: JSONPoint | null): boolean => {
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
  point: JSONPoint | null,
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
