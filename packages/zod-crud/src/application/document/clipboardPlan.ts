import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { SelectionSource } from "../../domain/selection/index.js";
import {
  copy,
  type ClipboardSource,
  type CopyError,
  type CopyOk,
} from "../../domain/verbs/copy.js";
import { cut, type CutError } from "../../domain/verbs/cut.js";
import {
  paste,
  rekeyProducesTrustedPayload,
  resolvePasteArgs,
  type PasteDuMismatch,
  type PasteError,
  type PasteOptions,
  type PasteTarget,
} from "../../domain/verbs/paste.js";
import type {
  ClipboardBuffer,
  ClipboardCutResult,
  ClipboardMutationOk,
} from "./clipboardTypes.js";

export interface ClipboardCutPlanContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source: ClipboardSource;
  stateJsonTrusted?: boolean;
  clonePayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface ClipboardPastePlanContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  payload: unknown;
  target?: PasteTarget;
  selectionTarget?: Pointer | null;
  options?: PasteOptions;
  spreadByDefault?: boolean;
  trustedPayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface ClipboardPastePreviewInput<S extends z.ZodType> {
  trustedPayload: boolean;
  options: PasteOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface ClipboardPastePreviewPlan<S extends z.ZodType> {
  trustedPayload: boolean;
  patchValuesTrusted: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface ClipboardCopyPlanContext {
  state: unknown;
  source: ClipboardSource;
  stateJsonTrusted?: boolean;
  clonePayload?: boolean;
}

export interface ClipboardPasteApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface ClipboardCutApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

export interface ClipboardSchemaTrustedSourceBufferInput {
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

export type ClipboardSourceOperation = "copy" | "cut";

export interface ClipboardSourcePlanInput {
  operation: ClipboardSourceOperation;
  source?: ClipboardSource;
  selectionSource?: SelectionSource | null;
}

export type ClipboardCopySourcePlan =
  | { ok: true; source: ClipboardSource }
  | { ok: false; result: CopyError };

export type ClipboardCutSourcePlan =
  | { ok: true; source: ClipboardSource }
  | { ok: false; result: CutError };

export type ClipboardCutPlanResult<T> =
  | {
      ok: true;
      next: T;
      patch: JSONPatchOperation[];
      applied: ReadonlyArray<JSONPatchOperation>;
      payload: unknown;
      source: Pointer;
      sources: ReadonlyArray<Pointer>;
    }
  | CutError;

export type ClipboardPastePlanResult<T> =
  | {
      ok: true;
      next: T;
      patch: JSONPatchOperation[];
      applied: ReadonlyArray<JSONPatchOperation>;
    }
  | PasteError
  | PasteDuMismatch;

export function planClipboardCopy(
  context: ClipboardCopyPlanContext,
): CopyOk | CopyError {
  const copyOptions: { trusted: boolean; clonePayload?: boolean } = {
    trusted: context.stateJsonTrusted === true,
  };
  if (context.clonePayload !== undefined) copyOptions.clonePayload = context.clonePayload;
  return copy(context.state, context.source, copyOptions);
}

export function planClipboardCut<S extends z.ZodType>(
  context: ClipboardCutPlanContext<S>,
): ClipboardCutPlanResult<z.output<S>> {
  const cutOptions: {
    trusted: boolean;
    clonePayload?: boolean;
    previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  } = {
    trusted: context.stateJsonTrusted === true,
  };
  if (context.clonePayload !== undefined) cutOptions.clonePayload = context.clonePayload;
  if (context.previewPatch !== undefined) cutOptions.previewPatch = context.previewPatch;
  return cut(context.schema, context.state, context.source, cutOptions);
}

export function planClipboardPaste<S extends z.ZodType>(
  context: ClipboardPastePlanContext<S>,
): ClipboardPastePlanResult<z.output<S>> {
  const args = resolvePasteArgs(context.target, context.options);
  const target = args.target ?? context.selectionTarget ?? null;
  if (target === null) {
    return {
      ok: false,
      code: "empty_selection",
      message: "paste target selection is empty",
    };
  }
  const spread = args.options.spread ?? context.spreadByDefault ?? false;
  const preview = planClipboardPastePreview({
    trustedPayload: context.trustedPayload === true,
    options: args.options,
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
    ...(context.previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch: context.previewTrustedValuesPatch } : {}),
  });
  return paste(context.schema, context.state, context.payload, target, args.mode, {
    ...args.options,
    spread,
    previewPatch: preview.previewPatch,
    trustedPayload: preview.trustedPayload,
  });
}

function planClipboardPastePreview<S extends z.ZodType>(
  input: ClipboardPastePreviewInput<S>,
): ClipboardPastePreviewPlan<S> {
  const trustedPayload = input.trustedPayload || input.options.trustedPayload === true;
  const patchValuesTrusted = trustedPayload || rekeyProducesTrustedPayload(input.options);
  const previewPatch = patchValuesTrusted && input.previewTrustedValuesPatch
    ? input.previewTrustedValuesPatch
    : input.previewPatch;
  const plan: ClipboardPastePreviewPlan<S> = {
    trustedPayload,
    patchValuesTrusted,
  };
  if (previewPatch !== undefined) plan.previewPatch = previewPatch;
  return plan;
}

export function planClipboardPasteApplyResult<T>(
  input: ClipboardPasteApplyResultInput<T>,
): ClipboardMutationOk<T> | PasteError {
  if (input.result.ok) {
    return {
      ok: true,
      value: input.state,
      applied: input.applied,
    };
  }
  return {
    ok: false,
    code: input.result.code,
    message: input.result.reason ?? input.result.code,
  };
}

export function planClipboardCutApplyResult<T>(
  input: ClipboardCutApplyResultInput<T>,
): ClipboardCutResult<T> {
  if (!input.result.ok) {
    return {
      ok: false,
      code: input.result.code,
      message: input.result.reason ?? input.result.code,
      violations: [],
    };
  }
  return {
    ok: true,
    value: input.state,
    applied: input.applied,
    payload: input.payload,
    source: input.source,
    sources: input.sources,
  };
}

export function planClipboardSchemaTrustedSourceBuffer(
  input: ClipboardSchemaTrustedSourceBufferInput,
): ClipboardBuffer {
  return {
    payload: input.payload,
    source: input.source,
    sources: [...input.sources],
    schemaTrusted: true,
  };
}

export function planClipboardSource(
  input: ClipboardSourcePlanInput & { operation: "copy" },
): ClipboardCopySourcePlan;
export function planClipboardSource(
  input: ClipboardSourcePlanInput & { operation: "cut" },
): ClipboardCutSourcePlan;
export function planClipboardSource(
  input: ClipboardSourcePlanInput,
): ClipboardCopySourcePlan | ClipboardCutSourcePlan {
  const source = input.source ?? input.selectionSource ?? null;
  if (source !== null) return { ok: true, source };
  return {
    ok: false,
    result: input.operation === "copy" ? emptyCopySource() : emptyCutSource(),
  };
}

function emptyCopySource(): CopyError {
  return {
    ok: false,
    code: "empty_selection",
    message: "copy source selection is empty",
  };
}

function emptyCutSource(): CutError {
  return {
    ok: false,
    code: "empty_selection",
    message: "cut source selection is empty",
  };
}
