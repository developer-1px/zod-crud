import type * as z from "zod";

import { parse as parseJSONPath } from "../../foundation/jsonpath/parser.js";
import { JSONPathSyntaxError } from "../../foundation/jsonpath/tokenizer.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  primaryPointer,
  selectedSource,
} from "../../domain/selection/selectionRead.js";
import { resolveSelectionScope } from "../../domain/selection/selectionOrder.js";
import { resolveSelectionCursor } from "../../domain/selection/selectionReducer.js";
import {
  EMPTY_SELECTION,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionScopeOptions,
  type SelectionSource,
} from "../../domain/selection/selectionTypes.js";
import type { SelectionTextDeleteOptions } from "../../domain/selection/textDelete.js";
import type { SelectionTextEditOptions } from "../../domain/selection/textEdit.js";
import type { ClipboardSource } from "../../domain/verbs/copy.js";
import { resolveDuplicateArgs, type DuplicateOpts } from "../../domain/verbs/duplicate.js";
import { resolveMoveArgs } from "../../domain/verbs/move.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type { HistoryTransactionOptions } from "./stateOps.js";
import {
  OK,
  type CapabilityResult,
} from "./capabilityResultTypes.js";
import {
  type CapabilityPasteExecutionOptions,
  type DocumentCapabilityContext,
} from "./capabilityFacadeTypes.js";
import {
  planDocumentCopyCapability,
  planDocumentCutCapability,
  planDocumentPasteCapability,
} from "./capabilityClipboardPlan.js";
import {
  planDocumentDeleteTextCapability,
  planDocumentDuplicateCapability,
  planDocumentMoveCapability,
  planDocumentPatchCapability,
  planDocumentRemoveCapability,
  planDocumentReplaceArgs,
  planDocumentReplaceCapability,
  planDocumentReplaceTextCapability,
} from "./capabilityMutationPlan.js";
import { planDocumentCapabilityResult } from "./capabilityResultPlan.js";

export function canDocumentFind(jsonpath: string): CapabilityResult {
  try {
    parseJSONPath(jsonpath);
    return OK;
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message };
    }
    throw error;
  }
}

export function canDocumentSelectScope<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  options?: SelectionScopeOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionScope(context.state, options));
}

export function canDocumentMoveCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(context.selection ?? EMPTY_SELECTION, direction, context.state, options));
}

export function canDocumentExtendCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(context.selection ?? EMPTY_SELECTION, direction, context.state, options));
}

export function canDocumentMove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  fromOrTo: Pointer,
  maybeTo?: Pointer,
  hasToArg = arguments.length >= 3,
): CapabilityResult {
  const args = resolveMoveArgs(fromOrTo, maybeTo, hasToArg);
  return planDocumentMoveCapability({
    schema: context.schema,
    state: context.state,
    target: args.to,
    selectionSource: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(args.from !== undefined ? { source: args.from } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentDuplicate<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  sourceOrOpts?: Pointer | DuplicateOpts,
  opts?: DuplicateOpts,
): CapabilityResult {
  const args = resolveDuplicateArgs(sourceOrOpts, opts);
  return planDocumentDuplicateCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: primaryPointer(context.selection ?? EMPTY_SELECTION),
    options: args.opts,
    stateJsonTrusted: context.stateJsonTrusted === true,
    ...(args.source !== undefined ? { source: args.source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentRemove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: SelectionSource,
): CapabilityResult {
  return planDocumentRemoveCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentReplace<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  pathOrValue: Pointer | unknown,
  maybeValue?: unknown,
  hasValueArg = arguments.length >= 3,
): CapabilityResult {
  const args = planDocumentReplaceArgs({
    pathOrValue,
    value: maybeValue,
    hasValueArg,
  });
  return planDocumentReplaceCapability({
    schema: context.schema,
    state: context.state,
    value: args.value,
    selectionTarget: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(args.target !== undefined ? { target: args.target } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentReplaceText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  replacement: string,
  textOptions?: SelectionTextEditOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentReplaceTextCapability({
    schema: context.schema,
    state: context.state,
    selection: context.selection ?? EMPTY_SELECTION,
    replacement,
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentDeleteText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  textOptions?: SelectionTextDeleteOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentDeleteTextCapability({
    schema: context.schema,
    state: context.state,
    selection: context.selection ?? EMPTY_SELECTION,
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentPatch<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  operations: ReadonlyArray<JSONPatchOperation>,
): CapabilityResult {
  return planDocumentPatchCapability({
    schema: context.schema,
    state: context.state,
    operations,
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentCut<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCutCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    stateJsonTrusted: context.stateJsonTrusted === true,
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
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    stateJsonTrusted: context.stateJsonTrusted === true,
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
    selectionTarget: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(target !== undefined ? { target } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(executionOptions?.trustedPayload !== undefined ? { trustedPayload: executionOptions.trustedPayload } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
    ...(context.previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch: context.previewTrustedValuesPatch } : {}),
  });
}
