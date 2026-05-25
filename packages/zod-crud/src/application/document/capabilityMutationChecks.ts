import type * as z from "zod";

import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import {
  primaryPointer,
  selectedSource,
} from "../../domain/selection/selectionRead.js";
import type { SelectionSource } from "../../domain/selection/selectionTypes.js";
import type { SelectionTextDeleteOptions } from "../../domain/selection/textDelete.js";
import type { SelectionTextEditOptions } from "../../domain/selection/textEdit.js";
import { resolveDuplicateArgs, type DuplicateOpts } from "../../domain/verbs/duplicate.js";
import { resolveMoveArgs } from "../../domain/verbs/move.js";
import type { HistoryTransactionOptions } from "./stateOps.js";
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
  planDocumentDeleteTextCapability,
  planDocumentDuplicateCapability,
  planDocumentMoveCapability,
  planDocumentPatchCapability,
  planDocumentRemoveCapability,
  planDocumentReplaceArgs,
  planDocumentReplaceCapability,
  planDocumentReplaceTextCapability,
} from "./capabilityMutationPlan.js";

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
    selectionSource: primaryPointer(documentSelectionState(context)),
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
    selectionSource: primaryPointer(documentSelectionState(context)),
    options: args.opts,
    stateJsonTrusted: documentTrustedState(context),
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
    selectionSource: selectedSource(documentSelectionState(context)),
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
    selectionTarget: primaryPointer(documentSelectionState(context)),
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
    selection: documentSelectionState(context),
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
    selection: documentSelectionState(context),
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
