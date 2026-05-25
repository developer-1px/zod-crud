import type * as z from "zod";

import {
  canDocumentCopy,
  canDocumentCut,
  canDocumentDeleteText,
  canDocumentDuplicate,
  canDocumentExtendCursor,
  canDocumentFind,
  canDocumentMove,
  canDocumentMoveCursor,
  canDocumentPaste,
  canDocumentPatch,
  canDocumentRemove,
  canDocumentReplace,
  canDocumentReplaceText,
  canDocumentSelectScope,
} from "./capabilityChecks.js";
import {
  OK,
  type CapabilityResult,
} from "./capabilityResultTypes.js";
import type {
  BuildDocumentCapabilitiesArgs,
  DocumentCapabilities,
  DocumentCapabilityContext,
} from "./capabilityFacadeTypes.js";

export {
  canDocumentCopy,
  canDocumentCut,
  canDocumentDeleteText,
  canDocumentDuplicate,
  canDocumentExtendCursor,
  canDocumentFind,
  canDocumentMove,
  canDocumentMoveCursor,
  canDocumentPaste,
  canDocumentPatch,
  canDocumentRemove,
  canDocumentReplace,
  canDocumentReplaceText,
  canDocumentSelectScope,
} from "./capabilityChecks.js";
export {
  isDocumentJSONPathTarget,
  planDocumentCapabilityResult,
  planDocumentCopyCapability,
  planDocumentCutCapability,
  planDocumentDeleteTextCapability,
  planDocumentDuplicateCapability,
  planDocumentMoveCapability,
  planDocumentPasteCapability,
  planDocumentPatchCapability,
  planDocumentRemoveCapability,
  planDocumentReplaceArgs,
  planDocumentReplaceCapability,
  planDocumentReplaceTextCapability,
} from "./capabilityPlan.js";
export type {
  CapabilityErrorCode,
  CapabilityResult,
  CapabilityViolation,
  DocumentCapabilitySourceResult,
} from "./capabilityResultTypes.js";
export type {
  CapabilityPasteExecutionOptions,
  PlanDocumentCopyCapabilityInput,
  PlanDocumentCutCapabilityInput,
  PlanDocumentPasteCapabilityInput,
} from "./capabilityClipboardTypes.js";
export type {
  BuildDocumentCapabilitiesArgs,
  CapabilityHistoryControls,
  DocumentCapabilities,
  DocumentCapabilityContext,
} from "./capabilityFacadeTypes.js";
export type {
  DocumentReplaceArgsPlan,
  PlanDocumentDeleteTextCapabilityInput,
  PlanDocumentDuplicateCapabilityInput,
  PlanDocumentMoveCapabilityInput,
  PlanDocumentPatchCapabilityInput,
  PlanDocumentRemoveCapabilityInput,
  PlanDocumentReplaceArgsInput,
  PlanDocumentReplaceCapabilityInput,
  PlanDocumentReplaceTextCapabilityInput,
} from "./capabilityMutationTypes.js";

export function buildDocumentCapabilities<S extends z.ZodType>(
  args: BuildDocumentCapabilitiesArgs<S>,
): DocumentCapabilities {
  const { schema, ops, previewPatch, previewTrustedValuesPatch, getStateJsonTrusted, history, selectionRef } = args;
  const context = (): DocumentCapabilityContext<S> => {
    const current: DocumentCapabilityContext<S> = {
      schema,
      state: ops.state,
      stateJsonTrusted: getStateJsonTrusted?.() === true,
    };
    if (selectionRef !== undefined) current.selection = selectionRef.current;
    if (previewPatch !== undefined) current.previewPatch = previewPatch;
    if (previewTrustedValuesPatch !== undefined) current.previewTrustedValuesPatch = previewTrustedValuesPatch;
    return current;
  };

  return {
    selectScope(options) {
      return canDocumentSelectScope(context(), options);
    },
    moveCursor(direction, options) {
      return canDocumentMoveCursor(context(), direction, options);
    },
    extendCursor(direction, options) {
      return canDocumentExtendCursor(context(), direction, options);
    },
    find(jsonpath) {
      return canDocumentFind(jsonpath);
    },
    move(fromOrTo, maybeTo) {
      return canDocumentMove(context(), fromOrTo, maybeTo, arguments.length >= 2);
    },
    duplicate(sourceOrOpts, opts) {
      return canDocumentDuplicate(context(), sourceOrOpts, opts);
    },
    remove(source) {
      return canDocumentRemove(context(), source);
    },
    replace(pathOrValue, maybeValue) {
      return canDocumentReplace(context(), pathOrValue, maybeValue, arguments.length >= 2);
    },
    replaceText(replacement, textOptions) {
      return canDocumentReplaceText(context(), replacement, textOptions);
    },
    deleteText(textOptions) {
      return canDocumentDeleteText(context(), textOptions);
    },
    cut(source) {
      return canDocumentCut(context(), source);
    },
    copy(source) {
      return canDocumentCopy(context(), source);
    },
    paste(payload, target, options, executionOptions) {
      return canDocumentPaste(context(), payload, target, options, executionOptions);
    },
    patch(operations) {
      return canDocumentPatch(context(), operations);
    },

    get undo() {
      return history.canUndo() ? OK : emptyStack("undo");
    },
    get redo() {
      return history.canRedo() ? OK : emptyStack("redo");
    },
  };
}

function emptyStack(kind: "undo" | "redo"): CapabilityResult {
  return {
    ok: false,
    code: "empty_stack",
    reason: `${kind} stack is empty`,
  };
}
