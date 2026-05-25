import type * as z from "zod";

import {
  primaryPointer,
  selectedSource,
} from "../../domain/selection/index.js";
import type { ClipboardSource } from "../../domain/verbs/copy.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import {
  type CapabilityPasteExecutionOptions,
} from "./capabilityClipboardTypes.js";
import {
  type CapabilityResult,
} from "./capabilityResultTypes.js";
import {
  type DocumentCapabilityContext,
} from "./capabilityFacadeTypes.js";
import {
  documentSelectionState,
  documentTrustedState,
} from "./capabilityCheckContext.js";
import {
  planDocumentCopyCapability,
  planDocumentCutCapability,
  planDocumentPasteCapability,
} from "./capabilityClipboardPlan.js";

export function canDocumentCut<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCutCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(documentSelectionState(context)),
    stateJsonTrusted: documentTrustedState(context),
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentCopy<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCopyCapability({
    state: context.state,
    selectionSource: selectedSource(documentSelectionState(context)),
    stateJsonTrusted: documentTrustedState(context),
    ...(source !== undefined ? { source } : {}),
  });
}

export function canDocumentPaste<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  payload: unknown,
  target?: PasteTarget,
  options?: PasteOptions,
  executionOptions?: CapabilityPasteExecutionOptions,
): CapabilityResult {
  return planDocumentPasteCapability({
    schema: context.schema,
    state: context.state,
    payload,
    selectionTarget: primaryPointer(documentSelectionState(context)),
    ...(target !== undefined ? { target } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(executionOptions?.trustedPayload !== undefined ? { trustedPayload: executionOptions.trustedPayload } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
    ...(context.previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch: context.previewTrustedValuesPatch } : {}),
  });
}
