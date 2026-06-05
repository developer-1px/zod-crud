import {
  parentPointer,
  tryParsePointer,
  type JSONDocumentPasteTarget,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";

import {
  copyRange,
} from "./copy.js";
import type {
  ProtectedRange,
  ProtectedRangeError,
  ProtectedRangeOperation,
} from "./types.js";

export function protectedPatchOperation(
  ranges: ReadonlyArray<ProtectedRange>,
  operation: JSONPatchOperation,
): ProtectedRangeError | null {
  switch (operation.op) {
    case "add":
      return protectedWrite(ranges, "patch", operation.path, "add");
    case "remove":
      return protectedWrite(ranges, "patch", operation.path, "remove");
    case "replace":
      return protectedWrite(ranges, "patch", operation.path, "replace");
    case "move":
      return protectedWrite(ranges, "patch", operation.from, "remove")
        ?? protectedWrite(ranges, "patch", operation.path, "add");
    case "copy":
      return protectedWrite(ranges, "patch", operation.path, "add");
    case "test":
      return null;
  }
}

export function protectedPasteTarget(
  ranges: ReadonlyArray<ProtectedRange>,
  target: JSONDocumentPasteTarget,
): ProtectedRangeError | null {
  if (typeof target === "string") return protectedWrite(ranges, "paste", target, "add");
  if ("replace" in target) return protectedWrite(ranges, "paste", target.replace, "replace");
  if ("before" in target) return protectedWrite(ranges, "paste", target.before, "add");
  if ("after" in target) {
    const insertion = insertionAfter(target.after);
    return protectedWrite(ranges, "paste", insertion, "add");
  }
  return null;
}

export function protectedWrite(
  ranges: ReadonlyArray<ProtectedRange>,
  operation: ProtectedRangeOperation,
  pointer: Pointer,
  kind: "add" | "remove" | "replace",
): ProtectedRangeError | null {
  const parsed = tryParsePointer(pointer);
  if (parsed === null) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid pointer: ${pointer}`,
      operation,
    };
  }

  for (const range of ranges) {
    const direct = isSameOrDescendant(pointer, range.pointer) || isSameOrDescendant(range.pointer, pointer);
    if (direct || shiftsProtectedArrayItem(pointer, range.pointer, kind)) {
      return protectedRangeError(operation, pointer, range);
    }
  }
  return null;
}

function isSameOrDescendant(pointer: Pointer, ancestor: Pointer): boolean {
  if (pointer === ancestor) return true;
  if (ancestor === "") return pointer.startsWith("/");
  return pointer.startsWith(`${ancestor}/`);
}

function shiftsProtectedArrayItem(
  pointer: Pointer,
  protectedPointer: Pointer,
  kind: "add" | "remove" | "replace",
): boolean {
  if (kind === "replace") return false;

  const pointerLocation = arrayItemLocation(pointer);
  const protectedLocation = arrayItemLocation(protectedPointer);
  if (pointerLocation === null || protectedLocation === null) return false;
  if (pointerLocation.parent !== protectedLocation.parent) return false;
  if (pointerLocation.index === "-") return false;
  if (protectedLocation.index === "-") return false;

  return pointerLocation.index <= protectedLocation.index;
}

function arrayItemLocation(pointer: Pointer): { parent: Pointer; index: number | "-" } | null {
  const parent = parentPointer(pointer);
  if (parent === null) return null;
  const last = pointer.slice(parent === "" ? 1 : parent.length + 1);
  if (last === "-") return { parent, index: "-" };
  if (!/^(0|[1-9]\d*)$/.test(last)) return null;
  return { parent, index: Number(last) };
}

function insertionAfter(pointer: Pointer): Pointer {
  const location = arrayItemLocation(pointer);
  if (location === null || location.index === "-") return pointer;
  const suffix = String(location.index + 1);
  return `${location.parent === "" ? "" : location.parent}/${suffix}` as Pointer;
}

function protectedRangeError(
  operation: ProtectedRangeOperation,
  pointer: Pointer,
  range: ProtectedRange,
): ProtectedRangeError {
  return {
    ok: false,
    code: "protected_range",
    reason: `${pointer} touches protected range ${range.pointer}`,
    operation,
    pointer,
    range: copyRange(range),
  };
}
