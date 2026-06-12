import type {
  JSONDocument,
  Pointer,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";

export function normalizeSelection(value: unknown): SelectionSnap | null {
  if (!isSelectionSnap(value)) return null;
  const snapshot: SelectionSnap = {
    selectedPointers: [...value.selectedPointers],
    selectionRanges: value.selectionRanges.map((range) => ({
      anchor: cloneSelectionPoint(range.anchor),
      focus: cloneSelectionPoint(range.focus),
    })),
    primaryIndex: value.primaryIndex,
    anchor: value.anchor === null ? null : cloneSelectionPoint(value.anchor),
    focus: value.focus === null ? null : cloneSelectionPoint(value.focus),
  };
  if (value.context === undefined) return snapshot;
  return { ...snapshot, context: value.context };
}

export function selectionPointersExist<T>(
  doc: JSONDocument<T>,
  selection: SelectionSnap | null,
): boolean {
  if (selection === null) return false;
  const pointers = selectionPointerPaths(selection);
  return pointers.length > 0 && pointers.every((pointer) => doc.exists(pointer));
}

function selectionPointerPaths(selection: SelectionSnap): Pointer[] {
  const pointers: Pointer[] = [];
  for (const pointer of selection.selectedPointers) pointers.push(pointer);
  for (const range of selection.selectionRanges) {
    pointers.push(selectionPointPath(range.anchor));
    pointers.push(selectionPointPath(range.focus));
  }
  if (selection.anchor !== null) pointers.push(selectionPointPath(selection.anchor));
  if (selection.focus !== null) pointers.push(selectionPointPath(selection.focus));
  return [...new Set(pointers)];
}

function selectionPointPath(point: SelectionPoint): Pointer {
  return typeof point === "string" ? point : point.path;
}

function isSelectionSnap(value: unknown): value is SelectionSnap {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    selectedPointers?: unknown;
    selectionRanges?: unknown;
    primaryIndex?: unknown;
    anchor?: unknown;
    focus?: unknown;
  };
  return Array.isArray(candidate.selectedPointers)
    && candidate.selectedPointers.every((pointer) => typeof pointer === "string")
    && Array.isArray(candidate.selectionRanges)
    && candidate.selectionRanges.every(isSelectionRange)
    && typeof candidate.primaryIndex === "number"
    && (candidate.anchor === null || isSelectionPoint(candidate.anchor))
    && (candidate.focus === null || isSelectionPoint(candidate.focus));
}

function isSelectionRange(value: unknown): value is { anchor: SelectionPoint; focus: SelectionPoint } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { anchor?: unknown; focus?: unknown };
  return isSelectionPoint(candidate.anchor) && isSelectionPoint(candidate.focus);
}

function isSelectionPoint(value: unknown): value is SelectionPoint {
  if (typeof value === "string") return true;
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { path?: unknown }).path === "string";
}

function cloneSelectionPoint(point: SelectionPoint): SelectionPoint {
  return typeof point === "string" ? point : { ...point };
}
