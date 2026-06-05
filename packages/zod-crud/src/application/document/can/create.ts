import type * as z from "zod";
import { parse as parseJSONPath } from "../../../foundation/jsonpath/parse.js";
import { JSONPathSyntaxError } from "../../../foundation/jsonpath/tokenize.js";
import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import { copy } from "../../../domain/clipboard/copy.js";
import { cut } from "../../../domain/clipboard/cut.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs } from "../../../domain/clipboard/paste.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOpts } from "../../../domain/edit/duplicate.js";
import { patchPreflight, patchPreflightFromApplyResult } from "../../../domain/schema/patch.js";
import {
  primaryPointer,
  selectedSource,
} from "../../../domain/selection/read.js";
import { deleteSelectionText, type SelectionTextDeleteOptions } from "../../../domain/selection/textDelete.js";
import { replaceSelectionText, type SelectionTextEditOptions } from "../../../domain/selection/textEdit.js";
import { EMPTY_SELECTION, type SelectionSnap } from "../../../domain/selection/snap.js";
import type { SelectionSource } from "../../../domain/selection/read.js";
import type {
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "../clipboard/contract.js";
import {
  planDocumentDelete,
  planDocumentInsert,
  planDocumentMove,
  planDocumentReplace,
} from "../edit/plan.js";
import type { JSONDocumentCommitOptions } from "../history/metadata.js";
import type { JSONStateOps } from "../state/ops.js";
import {
  OK,
  capabilityResult,
  type CapabilityResult,
} from "./result.js";

type CapabilityPasteExecutionOptions = { trustedPayload?: boolean };

export interface DocumentCapabilities {
  find(jsonpath: string): CapabilityResult;
  insert(pathOrValue: Pointer | unknown, value?: unknown): CapabilityResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CapabilityResult;
  move(fromOrTo: Pointer, to?: Pointer): CapabilityResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CapabilityResult;
  delete(source?: SelectionSource): CapabilityResult;
  replaceText(replacement: string, options?: SelectionTextEditOptions & JSONDocumentCommitOptions): CapabilityResult;
  deleteText(options?: SelectionTextDeleteOptions & JSONDocumentCommitOptions): CapabilityResult;
  cut(source?: SelectionSource): CapabilityResult;
  copy(source?: SelectionSource): CapabilityResult;
  paste(
    payload: unknown,
    target?: JSONDocumentPasteTarget,
    options?: JSONDocumentPasteOptions,
    executionOptions?: CapabilityPasteExecutionOptions,
  ): CapabilityResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CapabilityResult;
  readonly undo: CapabilityResult;
  readonly redo: CapabilityResult;
}

interface CreateDocumentCapabilitiesArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONStateOps<z.output<S>>;
  history: { canUndo(): boolean; canRedo(): boolean };
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  getStateJsonTrusted?: () => boolean;
  selectionRef?: { current: SelectionSnap };
}

export function createDocumentCapabilities<S extends z.ZodType>(
  args: CreateDocumentCapabilitiesArgs<S>,
): DocumentCapabilities {
  const { schema, ops, previewPatch, previewTrustedValuesPatch, getStateJsonTrusted, history, selectionRef } = args;
  const state = () => ops.state;
  const selection = () => selectionRef?.current ?? EMPTY_SELECTION;
  const stateJsonTrusted = () => getStateJsonTrusted?.() === true;
  const patch = (operations: ReadonlyArray<JSONPatchOperation>) => capabilityResult(
    previewPatch
      ? patchPreflightFromApplyResult(previewPatch(operations))
      : patchPreflight(schema, state(), operations),
  );

  return {
    find(jsonpath) {
      try {
        parseJSONPath(jsonpath);
        return OK;
      } catch (error) {
        if (error instanceof JSONPathSyntaxError) {
          return { ok: false, code: "syntax_error", reason: error.message };
        }
        throw error;
      }
    },
    insert(pathOrValue, maybeValue) {
      const plan = planDocumentInsert({
        selection: selection(),
        pathOrValue,
        value: maybeValue,
        hasValueArg: arguments.length >= 2,
      });
      return plan.ok ? patch(plan.operations) : plan;
    },
    move(fromOrTo, maybeTo) {
      const plan = planDocumentMove({
        selection: selection(),
        sourceOrTarget: fromOrTo,
        target: maybeTo,
        hasSourceArg: arguments.length >= 2,
      });
      return plan.ok ? patch(plan.operations) : plan;
    },
    duplicate(sourceOrOpts, opts) {
      const input = resolveDuplicateArgs(sourceOrOpts, opts);
      const source = input.source ?? primaryPointer(selection()) ?? null;
      return source === null
        ? emptySelectionCapability("duplicate source selection is empty")
        : capabilityResult(duplicate(schema, state(), source, input.opts, {
            previewPatch,
            trustedPayload: stateJsonTrusted(),
          }));
    },
    delete(source) {
      const plan = planDocumentDelete({ selection: selection(), source });
      return plan.ok ? patch(plan.operations) : plan;
    },
    replace(pathOrValue, maybeValue) {
      const plan = planDocumentReplace({
        state: state(),
        selection: selection(),
        pathOrValue,
        value: maybeValue,
        hasValueArg: arguments.length >= 2,
      });
      return plan.ok ? patch(plan.operations) : plan;
    },
    replaceText(replacement, textOptions) {
      const planned = replaceSelectionText(selection(), state(), replacement, textOptions);
      return planned.ok ? patch(planned.patch) : capabilityResult(planned);
    },
    deleteText(textOptions) {
      const planned = deleteSelectionText(selection(), state(), textOptions);
      return planned.ok ? patch(planned.patch) : capabilityResult(planned);
    },
    cut(source) {
      const resolved = source ?? selectedSource(selection()) ?? null;
      return resolved === null
        ? emptySelectionCapability("cut source selection is empty")
        : capabilityResult(cut(schema, state(), resolved, {
            trusted: stateJsonTrusted(),
            clonePayload: false,
            previewPatch,
          }));
    },
    copy(source) {
      const resolved = source ?? selectedSource(selection()) ?? null;
      return resolved === null
        ? emptySelectionCapability("copy source selection is empty")
        : capabilityResult(copy(state(), resolved, {
            trusted: stateJsonTrusted(),
            clonePayload: false,
          }));
    },
    paste(payload, target, options, executionOptions) {
      const input = resolvePasteArgs(target, options);
      const resolvedTarget = input.target ?? primaryPointer(selection()) ?? null;
      const inputTrustedPayload = executionOptions?.trustedPayload === true || input.options.trustedPayload === true;
      const patchValuesTrusted = inputTrustedPayload || rekeyProducesTrustedPayload(input.options);
      const pastePreview = patchValuesTrusted && previewTrustedValuesPatch ? previewTrustedValuesPatch : previewPatch;
      return resolvedTarget === null
        ? emptySelectionCapability("paste target selection is empty")
        : capabilityResult(paste(schema, state(), payload, resolvedTarget, input.mode, {
            ...input.options,
            previewPatch: pastePreview,
            trustedPayload: inputTrustedPayload,
          }));
    },
    patch: (operations) => patch(operations),

    get undo() {
      return history.canUndo() ? OK : emptyStack("undo");
    },
    get redo() {
      return history.canRedo() ? OK : emptyStack("redo");
    },
  };
}

function emptySelectionCapability(reason: string): CapabilityResult {
  return { ok: false, code: "empty_selection", reason };
}

function emptyStack(kind: "undo" | "redo"): CapabilityResult {
  return {
    ok: false,
    code: "empty_stack",
    reason: `${kind} stack is empty`,
  };
}
