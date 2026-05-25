import type * as z from "zod";

import { removeSourcesPatch } from "../../foundation/json-patch/removeSources.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import {
  patchPreflight,
  patchPreflightFromApplyResult,
} from "../../domain/schema/patchPreflight.js";
import { duplicate } from "../../domain/verbs/duplicate.js";
import { move as moveVerb } from "../../domain/verbs/move.js";
import { replace as replaceVerb } from "../../domain/verbs/replace.js";
import { replaceSelectionText } from "../../domain/selection/textEdit.js";
import { deleteSelectionText } from "../../domain/selection/textDelete.js";
import type {
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
import type { CapabilityResult } from "./capabilityResultTypes.js";
import {
  emptySelectionCapability,
  planDocumentCapabilityResult,
  pointerSourceCapabilityError,
} from "./capabilityResultPlan.js";

export function planDocumentMoveCapability<S extends z.ZodType>(
  input: PlanDocumentMoveCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelectionCapability("move source selection is empty")
    : planDocumentCapabilityResult(moveVerb(input.schema, input.state, source, input.target, {
        previewPatch: input.previewPatch,
      }));
}

export function planDocumentDuplicateCapability<S extends z.ZodType>(
  input: PlanDocumentDuplicateCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelectionCapability("duplicate source selection is empty")
    : planDocumentCapabilityResult(duplicate(input.schema, input.state, source, input.options, {
        previewPatch: input.previewPatch,
        trustedPayload: input.stateJsonTrusted === true,
      }));
}

export function planDocumentRemoveCapability<S extends z.ZodType>(
  input: PlanDocumentRemoveCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  if (resolved === null) return emptySelectionCapability("remove source selection is empty");
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
    ? emptySelectionCapability("replace target selection is empty")
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

export function planDocumentPatchCapability<S extends z.ZodType>(
  input: PlanDocumentPatchCapabilityInput<S>,
): CapabilityResult {
  const result = input.previewPatch
    ? patchPreflightFromApplyResult(input.previewPatch(input.operations))
    : patchPreflight(input.schema, input.state, input.operations);
  return planDocumentCapabilityResult(result);
}

export function planDocumentReplaceArgs(
  input: PlanDocumentReplaceArgsInput,
): DocumentReplaceArgsPlan {
  return input.hasValueArg
    ? { target: input.pathOrValue as Pointer, value: input.value }
    : { value: input.pathOrValue };
}

function isDocumentJSONPathTarget(value: Pointer): boolean {
  return value.startsWith("$");
}
