import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { ClipboardSource } from "../../domain/verbs/copy.js";
import { copy } from "../../domain/verbs/copy.js";
import { cut } from "../../domain/verbs/cut.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs } from "../../domain/verbs/paste.js";
import type { CapabilityResult } from "./capabilityResultTypes.js";
import {
  emptySelectionCapability,
  planDocumentCapabilityResult,
} from "./capabilityResultPlan.js";

interface PlanDocumentCopyCapabilityInput {
  state: unknown;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
}

interface PlanDocumentCutCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentPasteCapabilityInput<S extends z.ZodType> {
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

export function planDocumentCutCapability<S extends z.ZodType>(
  input: PlanDocumentCutCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelectionCapability("cut source selection is empty")
    : planDocumentCapabilityResult(cut(input.schema, input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
        previewPatch: input.previewPatch,
      }));
}

export function planDocumentCopyCapability(
  input: PlanDocumentCopyCapabilityInput,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelectionCapability("copy source selection is empty")
    : planDocumentCapabilityResult(copy(input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
      }));
}

export function planDocumentPasteCapability<S extends z.ZodType>(
  input: PlanDocumentPasteCapabilityInput<S>,
): CapabilityResult {
  const args = resolvePasteArgs(input.target, input.options);
  const resolvedTarget = args.target ?? input.selectionTarget ?? null;
  const inputTrustedPayload = input.trustedPayload === true
    || args.options.trustedPayload === true;
  const patchValuesTrusted = inputTrustedPayload
    || rekeyProducesTrustedPayload(args.options);
  const pastePreview = patchValuesTrusted && input.previewTrustedValuesPatch
    ? input.previewTrustedValuesPatch
    : input.previewPatch;
  return resolvedTarget === null
    ? emptySelectionCapability("paste target selection is empty")
    : planDocumentCapabilityResult(paste(input.schema, input.state, input.payload, resolvedTarget, args.mode, {
        ...args.options,
        previewPatch: pastePreview,
        trustedPayload: inputTrustedPayload,
      }));
}
