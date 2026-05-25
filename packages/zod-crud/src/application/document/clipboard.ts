import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { JSONStateOps } from "./stateOps.js";
import type { SelectionSource } from "../../domain/selection/index.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type {
  ClipboardBuffer,
  ClipboardPasteResult,
  ClipboardPeekResult,
  ClipboardState,
} from "./clipboardTypes.js";
import {
  EMPTY_CLIPBOARD,
  planClipboardPeekBuffer,
  planClipboardReadBuffer,
  planClipboardWriteBuffer,
} from "./clipboardBufferPlan.js";
import {
  planClipboardCopy,
  planClipboardCut,
  planClipboardCutApplyResult,
  planClipboardPaste,
  planClipboardPasteApplyResult,
  planClipboardSchemaTrustedSourceBuffer,
  planClipboardSource,
} from "./clipboardPlan.js";

export { EMPTY_CLIPBOARD, isClipboardSchemaTrustedPayload, planClipboardPeekBuffer, planClipboardReadBuffer, planClipboardWriteBuffer, planClipboardWritePayload, planClipboardWriteSources } from "./clipboardBufferPlan.js";
export { planClipboardCopy, planClipboardCut, planClipboardCutApplyResult, planClipboardPaste, planClipboardPasteApplyResult, planClipboardPastePreview, planClipboardSchemaTrustedSourceBuffer, planClipboardSource } from "./clipboardPlan.js";
export type { ClipboardBuffer, ClipboardCopyOptions, ClipboardCutOk, ClipboardCutOptions, ClipboardCutResult, ClipboardEmpty, ClipboardMutationOk, ClipboardPasteResult, ClipboardPeekResult, ClipboardReadOk, ClipboardReadOptions, ClipboardReadResult, ClipboardState, ClipboardWriteOptions } from "./clipboardTypes.js";
export type { ClipboardSchemaTrustedPayloadInput, ClipboardWriteBufferInput, ClipboardWriteBufferPlan, ClipboardWritePayloadInput, ClipboardWritePayloadPlan, ClipboardWriteSourcesResult } from "./clipboardBufferPlan.js";
export type { ClipboardCopyPlanContext, ClipboardCopySourcePlan, ClipboardCutApplyResultInput, ClipboardCutPlanContext, ClipboardCutPlanResult, ClipboardCutSourcePlan, ClipboardPasteApplyResultInput, ClipboardPastePlanContext, ClipboardPastePlanResult, ClipboardPastePreviewInput, ClipboardPastePreviewPlan, ClipboardSchemaTrustedSourceBufferInput, ClipboardSourceOperation, ClipboardSourcePlanInput } from "./clipboardPlan.js";

export const INTERNAL_CLIPBOARD_PEEK: unique symbol = Symbol("zod-crud.internal.clipboard.peek");

interface InternalClipboardState<T> extends ClipboardState<T> {
  [INTERNAL_CLIPBOARD_PEEK](): ClipboardPeekResult;
}

interface CreateClipboardOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONStateOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  applyPreviewedPatch?: (
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
  ) => JSONResult;
  getSelectionSource?: () => SelectionSource | null;
  getSelectionTarget?: () => Pointer | null;
  getAppliedPatch?: () => ReadonlyArray<JSONPatchOperation>;
  getStateJsonTrusted?: () => boolean;
  onChange?: () => void;
}

export function createClipboard<S extends z.ZodType>(
  args: CreateClipboardOptions<S>,
): InternalClipboardState<z.output<S>> {
  const {
    schema,
    getState,
    ops,
    previewPatch,
    previewTrustedValuesPatch,
    applyPreviewedPatch,
    getSelectionSource,
    getSelectionTarget,
    getAppliedPatch,
    getStateJsonTrusted,
    onChange,
  } = args;
  let buffer: ClipboardBuffer | null = null;

  const setBuffer = (next: ClipboardBuffer | null): void => {
    buffer = next;
    onChange?.();
  };

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },
    get sources() { return buffer?.sources ? [...buffer.sources] : null; },

    read(options = {}) {
      return planClipboardReadBuffer(buffer, options);
    },

    [INTERNAL_CLIPBOARD_PEEK]() {
      return planClipboardPeekBuffer(buffer);
    },

    write(payload, options = {}) {
      const plan = planClipboardWriteBuffer({
        state: getState(),
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        payload,
        options,
      });
      if (!plan.ok) return plan.result;
      setBuffer(plan.buffer);
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source, options = {}) {
      const sourcePlan = planClipboardSource({
        operation: "copy",
        ...(source !== undefined ? { source } : {}),
        selectionSource: getSelectionSource?.() ?? null,
      });
      if (!sourcePlan.ok) return sourcePlan.result;
      const result = planClipboardCopy({
        state: getState(),
        source: sourcePlan.source,
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        ...(options.clonePayload !== undefined ? { clonePayload: options.clonePayload } : {}),
      });
      if (result.ok) {
        setBuffer(planClipboardSchemaTrustedSourceBuffer(result));
      }
      return result;
    },

    cut(source, options = {}) {
      const sourcePlan = planClipboardSource({
        operation: "cut",
        ...(source !== undefined ? { source } : {}),
        selectionSource: getSelectionSource?.() ?? null,
      });
      if (!sourcePlan.ok) return sourcePlan.result;
      const result = planClipboardCut({
        schema,
        state: getState(),
        source: sourcePlan.source,
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        ...(options.clonePayload !== undefined ? { clonePayload: options.clonePayload } : {}),
        ...(previewPatch !== undefined ? { previewPatch } : {}),
      });
      if (!result.ok) return result;
      const patchResult = applyPreviewedPatch
        ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
        : ops.patch(result.patch);
      const applyResult = planClipboardCutApplyResult({
        result: patchResult,
        state: getState(),
        applied: getAppliedPatch?.() ?? result.patch,
        payload: result.payload,
        source: result.source,
        sources: result.sources,
      });
      if (applyResult.ok) {
        setBuffer(planClipboardSchemaTrustedSourceBuffer(applyResult));
      }
      return applyResult;
    },

    paste(target, options) {
      if (!buffer) return EMPTY_CLIPBOARD;
      return runPaste(buffer.payload, target, options, (buffer.sources?.length ?? 0) > 1, true);
    },

    pastePayload(target, payload, options) {
      return runPaste(payload, target, options, false, false);
    },
  };

  function runPaste(
    payload: unknown,
    targetOrSelectionTarget: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): ClipboardPasteResult<z.output<S>> {
    const result = planClipboardPaste({
      schema,
      state: getState(),
      payload,
      selectionTarget: getSelectionTarget?.() ?? null,
      spreadByDefault,
      trustedPayload,
      ...(targetOrSelectionTarget !== undefined ? { target: targetOrSelectionTarget } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(previewPatch !== undefined ? { previewPatch } : {}),
      ...(previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch } : {}),
    });
    if (!result.ok) return result;
    const patchResult = applyPreviewedPatch
      ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
      : ops.patch(result.patch);
    return planClipboardPasteApplyResult({
      result: patchResult,
      state: getState(),
      applied: getAppliedPatch?.() ?? result.patch,
    });
  }
}
