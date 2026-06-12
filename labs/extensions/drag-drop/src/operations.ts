import type { JSONDocument, JSONDocumentPasteTarget, Pointer } from "@interactive-os/json-document";
import { canDrop, pasteOptions, readCopyPayload } from "./plan.js";
import type { DragDropInput, DragDropPerformError, DragDropPerformResult } from "./types.js";

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

  const result = performPlannedDrop(doc, input, plan.target);
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

function performPlannedDrop<TDocument>(
  doc: JSONDocument<TDocument>,
  input: DragDropInput,
  target: Pointer | JSONDocumentPasteTarget,
): unknown {
  switch (input.source.kind) {
    case "move":
      return doc.move(input.source.pointer, target as Pointer);
    case "copy": {
      const payload = readCopyPayload(doc, input.source.pointer);
      return payload.ok
        ? doc.paste(target as JSONDocumentPasteTarget, pasteOptions(input.source, payload.value))
        : payload.capability;
    }
    case "payload":
      return doc.paste(target as JSONDocumentPasteTarget, pasteOptions(input.source, input.source.value));
  }
}

function isFailure(value: unknown): value is { ok: false; reason?: string; message?: string } {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && (value as { ok?: unknown }).ok === false;
}
