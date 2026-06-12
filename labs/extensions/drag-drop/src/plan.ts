import { appendSegment, type JSONCapabilityResult, type JSONDocument, type JSONDocumentPasteOptions, type JSONDocumentPasteTarget, lastSegmentIndex, parentPointer, type Pointer, type ReadResult } from "@interactive-os/json-document";
import type { DragDropError, DragDropInput, DragDropPlanResult, DragDropSource, DragDropTarget } from "./types.js";

export function canDrop<TDocument>(
  doc: JSONDocument<TDocument>,
  input: DragDropInput,
): DragDropPlanResult {
  if (input.source.kind === "move") {
    const target = moveTarget(input.source.pointer, input.target);
    if (!target.ok) return target;
    return {
      ok: true,
      kind: "move",
      target: target.pointer,
      capability: doc.canMove(input.source.pointer, target.pointer),
    };
  }

  const target = pasteTarget(input.target);
  if (!target.ok) return target;
  if (input.source.kind === "copy") {
    const payload = readCopyPayload(doc, input.source.pointer);
    return {
      ok: true,
      kind: "copy",
      target: target.target,
      capability: payload.ok
        ? doc.canPaste(target.target, pasteOptions(input.source, payload.value))
        : payload.capability,
    };
  }

  return {
    ok: true,
    kind: "payload",
    target: target.target,
    capability: doc.canPaste(target.target, pasteOptions(input.source, input.source.value)),
  };
}

function moveTarget(source: Pointer, target: DragDropTarget): { ok: true; pointer: Pointer } | DragDropError {
  if (typeof target === "string") return { ok: true, pointer: target };
  if ("into" in target) return { ok: true, pointer: target.into };
  if ("before" in target) return relativeMovePointer(source, target.before, "before");
  if ("after" in target) return relativeMovePointer(source, target.after, "after");
  return {
    ok: false,
    code: "unsupported_target",
    reason: "move drops do not support replace targets",
    pointer: target.replace,
  };
}

function pasteTarget(target: DragDropTarget): { ok: true; target: JSONDocumentPasteTarget } | DragDropError {
  if (typeof target === "string") return { ok: true, target };
  if ("into" in target) return { ok: true, target: target.into };
  if ("before" in target) return { ok: true, target: { before: target.before } };
  if ("after" in target) return { ok: true, target: { after: target.after } };
  return { ok: true, target: { replace: target.replace } };
}

function relativeMovePointer(
  source: Pointer,
  target: Pointer,
  position: "before" | "after",
): { ok: true; pointer: Pointer } | DragDropError {
  const targetLocation = arrayItemLocation(target);
  if (!targetLocation.ok) return targetLocation;

  const sourceLocation = arrayItemLocation(source);
  const sameParent = sourceLocation.ok && sourceLocation.parent === targetLocation.parent;
  if (position === "before") {
    const index = sameParent && sourceLocation.index < targetLocation.index
      ? targetLocation.index - 1
      : targetLocation.index;
    return { ok: true, pointer: appendSegment(targetLocation.parent, index) };
  }

  const index = sameParent && sourceLocation.index < targetLocation.index
    ? targetLocation.index
    : targetLocation.index + 1;
  return { ok: true, pointer: appendSegment(targetLocation.parent, index) };
}

function arrayItemLocation(pointer: Pointer):
  | { ok: true; parent: Pointer; index: number }
  | DragDropError {
  const index = lastSegmentIndex(pointer);
  const parent = parentPointer(pointer);
  if (index === null || parent === null) {
    return {
      ok: false,
      code: "invalid_target",
      reason: `relative target must address an array item: ${pointer}`,
      pointer,
    };
  }
  return { ok: true, parent, index };
}

export function pasteOptions(
  source: Extract<DragDropSource, { kind: "copy" | "payload" }>,
  payload: unknown,
): JSONDocumentPasteOptions {
  return source.options === undefined
    ? { payload }
    : { ...source.options, payload };
}

export function readCopyPayload<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
): { ok: true; value: unknown } | { ok: false; capability: JSONCapabilityResult } {
  const result = doc.at(pointer);
  if (result.ok) return { ok: true, value: result.value };
  return { ok: false, capability: readFailureCapability(result) };
}

function readFailureCapability(result: Extract<ReadResult, { ok: false }>): JSONCapabilityResult {
  const capability: JSONCapabilityResult = {
    ok: false,
    code: result.code,
    pointer: result.pointer,
  };
  if (result.reason !== undefined) capability.reason = result.reason;
  return capability;
}
