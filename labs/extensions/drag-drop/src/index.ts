import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type Pointer,
} from "zod-crud";

export type DragDropSource =
  | { kind: "move"; pointer: Pointer }
  | { kind: "payload"; value: unknown; options?: JSONDocumentPasteOptions };

export type DragDropTarget =
  | Pointer
  | { before: Pointer }
  | { after: Pointer }
  | { into: Pointer }
  | { replace: Pointer };

export interface DragDropInput {
  source: DragDropSource;
  target: DragDropTarget;
}

export type DragDropErrorCode =
  | "invalid_target"
  | "unsupported_target";

export interface DragDropError {
  ok: false;
  code: DragDropErrorCode;
  reason: string;
  pointer?: Pointer;
}

export interface DragDropPlan {
  ok: true;
  kind: DragDropSource["kind"];
  target: Pointer | JSONDocumentPasteTarget;
  capability: JSONCapabilityResult;
}

export type DragDropPlanResult =
  | DragDropPlan
  | DragDropError;

export interface DragDropPerformOk {
  ok: true;
  kind: DragDropSource["kind"];
  target: Pointer | JSONDocumentPasteTarget;
  result: unknown;
}

export interface DragDropPerformError {
  ok: false;
  code: "disabled" | "execution_failed" | DragDropErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: JSONCapabilityResult;
  result?: unknown;
}

export type DragDropPerformResult =
  | DragDropPerformOk
  | DragDropPerformError;

export interface DragDrop<TDocument> {
  canDrop(input: DragDropInput): DragDropPlanResult;
  perform(input: DragDropInput): DragDropPerformResult;
}

export function createDragDrop<TDocument>(
  doc: JSONDocument<TDocument>,
): DragDrop<TDocument> {
  return {
    canDrop(input) {
      return canDrop(doc, input);
    },
    perform(input) {
      return performDrop(doc, input);
    },
  };
}

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
  return {
    ok: true,
    kind: "payload",
    target: target.target,
    capability: doc.canPaste(target.target, pasteOptions(input.source)),
  };
}

export function performDrop<TDocument>(
  doc: JSONDocument<TDocument>,
  input: DragDropInput,
): DragDropPerformResult {
  const plan = canDrop(doc, input);
  if (!plan.ok) return plan;
  if (!plan.capability.ok) {
    const error: DragDropPerformError = {
      ok: false,
      code: "disabled",
      reason: plan.capability.reason ?? "drop is disabled",
      capability: plan.capability,
    };
    if (plan.capability.pointer !== undefined) error.pointer = plan.capability.pointer;
    return error;
  }

  const result = input.source.kind === "move"
    ? doc.move(input.source.pointer, plan.target as Pointer)
    : doc.paste(plan.target as JSONDocumentPasteTarget, pasteOptions(input.source));
  if (isFailure(result)) {
    return {
      ok: false,
      code: "execution_failed",
      reason: typeof result.reason === "string"
        ? result.reason
        : typeof result.message === "string"
          ? result.message
          : "drop execution failed",
      result,
    };
  }

  return {
    ok: true,
    kind: input.source.kind,
    target: plan.target,
    result,
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

function pasteOptions(source: Extract<DragDropSource, { kind: "payload" }>): JSONDocumentPasteOptions {
  return source.options === undefined
    ? { payload: source.value }
    : { ...source.options, payload: source.value };
}

function isFailure(value: unknown): value is { ok: false; reason?: string; message?: string } {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && (value as { ok?: unknown }).ok === false;
}
