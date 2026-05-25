import type * as z from "zod";

import { copy } from "../../domain/verbs/copy.js";
import { cut } from "../../domain/verbs/cut.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs } from "../../domain/verbs/paste.js";
import type {
  PlanDocumentCopyCapabilityInput,
  PlanDocumentCutCapabilityInput,
  PlanDocumentPasteCapabilityInput,
} from "./capabilityClipboardTypes.js";
import type { CapabilityResult } from "./capabilityResultTypes.js";
import {
  emptySelectionCapability,
  planDocumentCapabilityResult,
} from "./capabilityResultPlan.js";

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
