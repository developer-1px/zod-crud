import type { Pointer } from "../../foundation/pointer/index.js";
import type {
  SelectionPoint,
  SelectionRange,
} from "./point.js";
import type { SelectionSnap } from "./snap.js";
import {
  clonePoint,
  cloneRange,
  pointPath,
  samePoint,
} from "./point.js";

export type SelectionType = "None" | "Caret" | "Range";
export type SelectionSource = Pointer | ReadonlyArray<Pointer>;

export function isCollapsed(s: SelectionSnap): boolean {
  return s.selectionRanges.length === 1
    && s.anchor !== null
    && s.focus !== null
    && samePoint(s.anchor, s.focus);
}

export function selectionType(s: SelectionSnap): SelectionType {
  if (s.selectionRanges.length === 0) return "None";
  return isCollapsed(s) ? "Caret" : "Range";
}

export function primaryRange(s: SelectionSnap): SelectionRange | null {
  const range = s.selectionRanges[s.primaryIndex];
  return range === undefined ? null : cloneRange(range);
}

export function rangeCount(s: SelectionSnap): number {
  return s.selectionRanges.length;
}

export function selectedCount(s: SelectionSnap): number {
  return s.selectedPointers.length;
}

export function hasSelection(s: SelectionSnap): boolean {
  return selectedCount(s) > 0;
}

export function isSelected(s: SelectionSnap, pointer: Pointer): boolean {
  return s.selectedPointers.includes(pointer);
}

export function caretPoint(s: SelectionSnap): SelectionPoint | null {
  return isCollapsed(s) && s.focus !== null ? clonePoint(s.focus) : null;
}

export function anchorPointer(s: SelectionSnap): Pointer | null {
  return s.anchor === null ? null : pointPath(s.anchor);
}

export function focusPointer(s: SelectionSnap): Pointer | null {
  return s.focus === null ? null : pointPath(s.focus);
}

export function selectedSource(s: SelectionSnap): SelectionSource | null {
  if (s.selectedPointers.length === 0) return null;
  return s.selectedPointers.length === 1 ? s.selectedPointers[0]! : [...s.selectedPointers];
}

export function primaryPointer(s: SelectionSnap): Pointer | null {
  const range = primaryRange(s);
  return range ? pointPath(range.focus) : null;
}

export function caretPointer(s: SelectionSnap): Pointer | null {
  const caret = caretPoint(s);
  return caret ? pointPath(caret) : null;
}
