import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { ClipboardSource } from "../../domain/verbs/copy.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";

export interface CapabilityPasteExecutionOptions {
  trustedPayload?: boolean;
}

export interface PlanDocumentCopyCapabilityInput {
  state: unknown;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
}

export interface PlanDocumentCutCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentPasteCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  payload: unknown;
  selectionTarget?: Pointer | null;
  target?: PasteTarget;
  options?: PasteOptions;
  trustedPayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}
