import type * as z from "zod";
import { readAt, tryParsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import { isPlainStructuralSchema } from "../../../domain/schema/shared/schema.js";
import {
  paste,
  rekeyProducesTrustedPayload,
  resolvePasteArgs,
  type PasteOptions,
  type PasteTarget,
} from "../../../domain/clipboard/paste.js";
import {
  capabilityResult,
  type CapabilityResult,
} from "../can/result.js";
import type { JSONStateOps } from "../state/ops.js";
import type {
  ClipboardBuffer,
  ClipboardPasteResult,
  JSONDocumentPasteTarget,
} from "./contract.js";

interface CreateClipboardPasteRuntimeOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONStateOps<z.output<S>>;
  previewPatch?: ((operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>) | undefined;
  previewTrustedValuesPatch?: ((operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>) | undefined;
  applyPreviewedPatch?: ((
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
  ) => JSONResult) | undefined;
  getSelectionTarget?: (() => Pointer | null) | undefined;
  getAppliedPatch?: (() => ReadonlyArray<JSONPatchOperation>) | undefined;
}

export interface ClipboardPasteRuntime<T> {
  pastePayload(
    payload: unknown,
    target: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): ClipboardPasteResult<T>;
  canPastePayload(
    payload: unknown,
    target: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): CapabilityResult;
  canReplaceBufferedSource(
    buffer: ClipboardBuffer | null,
    target: JSONDocumentPasteTarget | undefined,
    options: PasteOptions | undefined,
  ): boolean;
}

export function createClipboardPasteRuntime<S extends z.ZodType>(
  options: CreateClipboardPasteRuntimeOptions<S>,
): ClipboardPasteRuntime<z.output<S>> {
  const {
    schema,
    getState,
    ops,
    previewPatch,
    previewTrustedValuesPatch,
    applyPreviewedPatch,
    getSelectionTarget,
    getAppliedPatch,
  } = options;

  function pasteExecutionOptions(
    pasteOptions: PasteOptions,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): PasteOptions & {
    previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  } {
    const nextTrustedPayload = trustedPayload || pasteOptions.trustedPayload === true;
    const patchValuesTrusted = nextTrustedPayload || rekeyProducesTrustedPayload(pasteOptions);
    const executionOptions: PasteOptions & {
      previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
    } = {
      ...pasteOptions,
      spread: pasteOptions.spread ?? spreadByDefault,
      trustedPayload: nextTrustedPayload,
    };
    const pastePreview = patchValuesTrusted && previewTrustedValuesPatch
      ? previewTrustedValuesPatch
      : previewPatch;
    if (pastePreview !== undefined) executionOptions.previewPatch = pastePreview;
    return executionOptions;
  }

  function resolvePasteTarget(
    targetOrSelectionTarget: PasteTarget | undefined,
    pasteOptions: PasteOptions | undefined,
  ) {
    const args = resolvePasteArgs(targetOrSelectionTarget, pasteOptions);
    const target = args.target ?? getSelectionTarget?.() ?? null;
    return target === null
      ? {
          ok: false as const,
          result: {
            ok: false as const,
            code: "empty_selection" as const,
            reason: "paste target selection is empty",
          },
        }
      : { ok: true as const, args, target };
  }

  return {
    pastePayload(payload, targetOrSelectionTarget, options, spreadByDefault, trustedPayload) {
      const resolved = resolvePasteTarget(targetOrSelectionTarget, options);
      if (!resolved.ok) return resolved.result;
      const result = paste(
        schema,
        getState(),
        payload,
        resolved.target,
        resolved.args.mode,
        pasteExecutionOptions(resolved.args.options, spreadByDefault, trustedPayload),
      );
      if (!result.ok) return result;
      const patchResult = applyPreviewedPatch
        ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
        : ops.patch(result.patch);
      return patchResult.ok
        ? {
            ok: true,
            value: getState(),
            applied: getAppliedPatch?.() ?? result.patch,
          }
        : {
            ok: false,
            code: patchResult.code,
            reason: patchResult.reason ?? patchResult.code,
          };
    },

    canPastePayload(payload, targetOrSelectionTarget, options, spreadByDefault, trustedPayload) {
      const resolved = resolvePasteTarget(targetOrSelectionTarget, options);
      if (!resolved.ok) return resolved.result;
      return capabilityResult(paste(
        schema,
        getState(),
        payload,
        resolved.target,
        resolved.args.mode,
        pasteExecutionOptions(resolved.args.options, spreadByDefault, trustedPayload),
      ));
    },

    canReplaceBufferedSource(buffer, target, options) {
      if (!buffer) return false;
      const replaceTarget = typeof target === "object" && target !== null && "replace" in target ? target.replace : null;
      const replaceSegments = replaceTarget === null ? null : tryParsePointer(replaceTarget);
      return buffer.schemaTrusted
        && buffer.source !== null
        && (buffer.sources?.length ?? 1) === 1
        && options?.rekey === undefined
        && options?.spread !== true
        && isPlainStructuralSchema(schema)
        && replaceTarget === buffer.source
        && replaceSegments !== null
        && readAt(getState(), replaceSegments).ok;
    },
  };
}
