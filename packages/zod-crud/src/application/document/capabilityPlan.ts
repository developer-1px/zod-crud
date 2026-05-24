import type * as z from "zod";

import { removeSourcesPatch } from "../../foundation/json-patch/removeSources.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { PointerSourceError } from "../../foundation/json-pointer/pointerSource.js";
import {
  patchPreflight,
  patchPreflightFromApplyResult,
} from "../../domain/schema/patchPreflight.js";
import { copy } from "../../domain/verbs/copy.js";
import { cut } from "../../domain/verbs/cut.js";
import { duplicate } from "../../domain/verbs/duplicate.js";
import { move as moveVerb } from "../../domain/verbs/move.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs } from "../../domain/verbs/paste.js";
import { replace as replaceVerb } from "../../domain/verbs/replace.js";
import { replaceSelectionText } from "../../domain/selection/textEdit.js";
import { deleteSelectionText } from "../../domain/selection/textDelete.js";
import {
  OK,
  type CapabilityResult,
  type DocumentCapabilitySourceResult,
  type DocumentReplaceArgsPlan,
  type PlanDocumentCopyCapabilityInput,
  type PlanDocumentCutCapabilityInput,
  type PlanDocumentDeleteTextCapabilityInput,
  type PlanDocumentDuplicateCapabilityInput,
  type PlanDocumentMoveCapabilityInput,
  type PlanDocumentPasteCapabilityInput,
  type PlanDocumentPatchCapabilityInput,
  type PlanDocumentRemoveCapabilityInput,
  type PlanDocumentReplaceArgsInput,
  type PlanDocumentReplaceCapabilityInput,
  type PlanDocumentReplaceTextCapabilityInput,
} from "./capabilityTypes.js";

export function planDocumentMoveCapability<S extends z.ZodType>(
  input: PlanDocumentMoveCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelection("move source selection is empty")
    : planDocumentCapabilityResult(moveVerb(input.schema, input.state, source, input.target, {
        previewPatch: input.previewPatch,
      }));
}

export function planDocumentDuplicateCapability<S extends z.ZodType>(
  input: PlanDocumentDuplicateCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelection("duplicate source selection is empty")
    : planDocumentCapabilityResult(duplicate(input.schema, input.state, source, input.options, {
        previewPatch: input.previewPatch,
        trustedPayload: input.stateJsonTrusted === true,
      }));
}

export function planDocumentRemoveCapability<S extends z.ZodType>(
  input: PlanDocumentRemoveCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  if (resolved === null) return emptySelection("remove source selection is empty");
  const planned = removeSourcesPatch(resolved);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(pointerSourceCapabilityError(planned, "remove"));
}

export function planDocumentReplaceCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceCapabilityInput<S>,
): CapabilityResult {
  if (input.target !== undefined && isDocumentJSONPathTarget(input.target)) {
    return planDocumentCapabilityResult(replaceVerb(input.schema, input.state, input.target, input.value, {
      previewPatch: input.previewPatch,
    }));
  }
  const target = input.target ?? input.selectionTarget ?? null;
  return target === null
    ? emptySelection("replace target selection is empty")
    : planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: [{ op: "replace", path: target, value: input.value }],
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      });
}

export function planDocumentReplaceTextCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceTextCapabilityInput<S>,
): CapabilityResult {
  const planned = replaceSelectionText(input.selection, input.state, input.replacement, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function planDocumentDeleteTextCapability<S extends z.ZodType>(
  input: PlanDocumentDeleteTextCapabilityInput<S>,
): CapabilityResult {
  const planned = deleteSelectionText(input.selection, input.state, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function planDocumentCutCapability<S extends z.ZodType>(
  input: PlanDocumentCutCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelection("cut source selection is empty")
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
    ? emptySelection("copy source selection is empty")
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
    ? emptySelection("paste target selection is empty")
    : planDocumentCapabilityResult(paste(input.schema, input.state, input.payload, resolvedTarget, args.mode, {
        ...args.options,
        previewPatch: pastePreview,
        trustedPayload: inputTrustedPayload,
      }));
}

export function planDocumentPatchCapability<S extends z.ZodType>(
  input: PlanDocumentPatchCapabilityInput<S>,
): CapabilityResult {
  const result = input.previewPatch
    ? patchPreflightFromApplyResult(input.previewPatch(input.operations))
    : patchPreflight(input.schema, input.state, input.operations);
  return planDocumentCapabilityResult(result);
}

export function planDocumentCapabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;

  const out: Extract<CapabilityResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}

function emptySelection(reason: string): CapabilityResult {
  return {
    ok: false,
    code: "empty_selection",
    reason,
  };
}

function pointerSourceCapabilityError(error: PointerSourceError, label: string): DocumentCapabilitySourceResult {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", reason: `invalid ${label} source pointer: ${error.pointer}`, pointer: error.pointer }
    : { ok: false, code: "empty_selection", reason: `${label} source selection is empty` };
}

export function planDocumentReplaceArgs(
  input: PlanDocumentReplaceArgsInput,
): DocumentReplaceArgsPlan {
  return input.hasValueArg
    ? { target: input.pathOrValue as Pointer, value: input.value }
    : { value: input.pathOrValue };
}

export function isDocumentJSONPathTarget(value: Pointer): boolean {
  return value.startsWith("$");
}
