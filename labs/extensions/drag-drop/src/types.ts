import type { JSONCapabilityResult, JSONDocumentPasteOptions, JSONDocumentPasteTarget, Pointer } from "zod-crud";

export type DragDropPayloadOptions = Omit<JSONDocumentPasteOptions, "payload">;

export type DragDropSource =
  | { kind: "move"; pointer: Pointer }
  | { kind: "copy"; pointer: Pointer; options?: DragDropPayloadOptions }
  | { kind: "payload"; value: unknown; options?: DragDropPayloadOptions };

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
