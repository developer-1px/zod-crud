import type * as z from "zod";

import { cloneTrustedPlainJson } from "../../../foundation/json/trustedClone.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import type { SelectionSource } from "../../../domain/selection/read.js";
import {
  copy,
} from "../../../domain/clipboard/copy.js";
import { cut } from "../../../domain/clipboard/cut.js";
import {
  OK,
  type CapabilityResult,
} from "../can/result.js";
import type {
  ClipboardBuffer,
  ClipboardCutResult,
  ClipboardEmpty,
  ClipboardPasteResult,
  ClipboardState,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "./contract.js";
import type { JSONStateOps } from "../state/ops.js";
import {
  trustedSourceBuffer,
  writeClipboardBuffer,
} from "./buffer.js";
import { createClipboardPasteRuntime } from "./paste.js";
import { splitPasteOptions } from "./pasteOptions.js";

const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  reason: "clipboard is empty",
};

export const INTERNAL_CLIPBOARD_CAN_PASTE: unique symbol = Symbol("json-document.internal.clipboard.canPaste");

interface InternalClipboardState<T> extends ClipboardState<T> {
  [INTERNAL_CLIPBOARD_CAN_PASTE](
    target?: JSONDocumentPasteTarget,
    options?: JSONDocumentPasteOptions,
  ): CapabilityResult;
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
  const pasteRuntime = createClipboardPasteRuntime({
    schema,
    getState,
    ops,
    previewPatch,
    previewTrustedValuesPatch,
    applyPreviewedPatch,
    getSelectionTarget,
    getAppliedPatch,
  });

  const setBuffer = (next: ClipboardBuffer | null): void => {
    buffer = next;
    onChange?.();
  };

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },
    get sources() { return buffer?.sources ? [...buffer.sources] : null; },

    read(options = {}) {
      if (!buffer) return EMPTY_CLIPBOARD;
      return {
        ok: true,
        payload: options.clonePayload === false
          ? buffer.payload
          : cloneTrustedPlainJson(buffer.payload),
        source: buffer.source,
        sources: buffer.sources ? [...buffer.sources] : null,
      };
    },

    write(payload, options = {}) {
      const plan = writeClipboardBuffer(getState(), getStateJsonTrusted?.() === true, payload, options);
      if (!plan.ok) return plan.result;
      setBuffer(plan.buffer);
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source, options = {}) {
      const resolvedSource = source ?? getSelectionSource?.() ?? null;
      if (resolvedSource === null) {
        return {
          ok: false,
          code: "empty_selection",
          reason: "copy source selection is empty",
        };
      }
      const copyOptions: { trusted: boolean; clonePayload?: boolean } = {
        trusted: getStateJsonTrusted?.() === true,
      };
      if (options.clonePayload !== undefined) copyOptions.clonePayload = options.clonePayload;
      const result = copy(getState(), resolvedSource, copyOptions);
      if (result.ok) {
        setBuffer(trustedSourceBuffer(result.payload, result.source, result.sources));
      }
      return result;
    },

    cut(source, options = {}) {
      const resolvedSource = source ?? getSelectionSource?.() ?? null;
      if (resolvedSource === null) {
        return {
          ok: false,
          code: "empty_selection",
          reason: "cut source selection is empty",
        };
      }
      const cutOptions: {
        trusted: boolean;
        clonePayload?: boolean;
        previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
      } = {
        trusted: getStateJsonTrusted?.() === true,
      };
      if (options.clonePayload !== undefined) cutOptions.clonePayload = options.clonePayload;
      if (previewPatch !== undefined) cutOptions.previewPatch = previewPatch;
      const result = cut(schema, getState(), resolvedSource, cutOptions);
      if (!result.ok) return result;
      const patchResult = applyPreviewedPatch
        ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
        : ops.patch(result.patch);
      const applyResult: ClipboardCutResult<z.output<S>> = patchResult.ok
        ? {
            ok: true,
            value: getState(),
            applied: getAppliedPatch?.() ?? result.patch,
            payload: result.payload,
            source: result.source,
            sources: result.sources,
          }
        : {
            ok: false,
            code: patchResult.code,
            reason: patchResult.reason ?? patchResult.code,
            violations: [],
          };
      if (applyResult.ok) {
        setBuffer(trustedSourceBuffer(applyResult.payload, applyResult.source, applyResult.sources));
      }
      return applyResult;
    },

    paste(target, options) {
      const pasteOptions = splitPasteOptions(options);
      if (pasteOptions.kind === "payload") {
        return pasteRuntime.pastePayload(pasteOptions.payload, target, pasteOptions.options, false, false);
      }
      if (!buffer) return EMPTY_CLIPBOARD;
      return pasteRuntime.pastePayload(buffer.payload, target, pasteOptions.options, (buffer.sources?.length ?? 0) > 1, true);
    },

    [INTERNAL_CLIPBOARD_CAN_PASTE](target, options) {
      const pasteOptions = splitPasteOptions(options);
      if (pasteOptions.kind === "payload") {
        return pasteRuntime.canPastePayload(pasteOptions.payload, target, pasteOptions.options, false, false);
      }
      if (!buffer) return EMPTY_CLIPBOARD;
      if (pasteRuntime.canReplaceBufferedSource(buffer, target, pasteOptions.options)) return OK;
      return pasteRuntime.canPastePayload(buffer.payload, target, pasteOptions.options, (buffer.sources?.length ?? 0) > 1, true);
    },
  };
}
