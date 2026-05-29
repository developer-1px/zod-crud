import type * as z from "zod";
import type { JSONPatchOperation, JSONResult } from "../../foundation/patch/types.js";
import type { Pointer } from "../../foundation/pointer/index.js";
import { EMPTY_SELECTION } from "../../domain/selection/types.js";
import { emptyMutableHistory } from "../../foundation/history.js";
import { removeSourcesPatch } from "../../foundation/patch/source.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard } from "./clipboard/clipboard.js";
import { createJSONState } from "./state/json.js";
import { buildReadFacade } from "./read.js";
import { createSchemaState } from "./schema.js";
import { createSelection } from "./selection/create.js";
import {
  canDocumentCopy,
  canDocumentCut,
  canDocumentDelete,
  canDocumentDeleteText,
  canDocumentDuplicate,
  canDocumentExtendCursor,
  canDocumentFind,
  canDocumentInsert,
  canDocumentMove,
  canDocumentMoveCursor,
  canDocumentPatch,
  canDocumentPaste,
  canDocumentReplace,
  canDocumentReplaceText,
  canDocumentSelectScope,
  planDocumentInsertArgs,
  planDocumentReplaceArgs,
} from "./can/check.js";
import {
  OK,
  type CapabilityResult,
} from "./can/result.js";
import type {
  BuildDocumentCapabilitiesArgs,
  DocumentCapabilities,
  DocumentCapabilityContext,
} from "./can/types.js";
import type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  JSONDocumentOptions,
} from "./types.js";
import { planDocumentCanPaste, planDocumentPatchCall, planDocumentSelectionRuntime } from "./state/commit.js";
import {
  planDocumentLifecycleChange,
  planDocumentSubscriptionChange,
  planDocumentSubscriptionMetadata,
} from "./state/change.js";
import { createDocumentMutationRuntime } from "./state/patch.js";
import { createDocumentHistoryRuntime } from "./history/undoRedo.js";
import type {
  DocumentHistoryRuntimeState,
} from "./history/types.js";
import type {
  DocumentPatchRuntimeState,
  JSONStateOps,
  TrustedDocumentStateOps,
} from "./runtime/types.js";

type TrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial?: false | undefined };
type JSONDocumentEditError = Extract<CapabilityResult, { ok: false }>;
type JSONDocumentEditResult = JSONResult | JSONDocumentEditError;

function buildDocumentCapabilities<S extends z.ZodType>(
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
    insert(pathOrValue, maybeValue) {
      return canDocumentInsert(context(), pathOrValue, maybeValue, arguments.length >= 2);
    },
    move(fromOrTo, maybeTo) {
      return canDocumentMove(context(), fromOrTo, maybeTo, arguments.length >= 2);
    },
    duplicate(sourceOrOpts, opts) {
      return canDocumentDuplicate(context(), sourceOrOpts, opts);
    },
    delete(source) {
      return canDocumentDelete(context(), source);
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

function editError(
  code: JSONDocumentEditError["code"],
  reason: string,
  pointer?: JSONDocumentEditError["pointer"],
): JSONDocumentEditError {
  return pointer === undefined
    ? { ok: false, code, reason }
    : { ok: false, code, reason, pointer };
}

export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.output<S>,
  options: TrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UntrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: JSONDocumentOptions = {},
): JSONDocument<z.output<S>> {
  const json = createJSONState(schema, initial, options);
  const rawOps: TrustedDocumentStateOps<z.output<S>> = json.ops;
  const historyLimit = options.history ?? 0;
  const historyState: DocumentHistoryRuntimeState = {
    stack: emptyMutableHistory(),
    isRestoring: false,
    activeHistoryMetadata: undefined,
    activeTransactionStartDepth: undefined,
  };
  const patchState: DocumentPatchRuntimeState = {
    lastPatch: [],
    documentSubscriberCount: 0,
  };

  const selectionRuntime = planDocumentSelectionRuntime({ selection: options.selection, onChange: options.onChange });
  const { selectionEnabled, selectionMode, createSelectionOptions } = selectionRuntime;
  const selectionState = selectionEnabled ? createSelection<z.output<S>>(rawOps, createSelectionOptions) : undefined;
  const syncLastPatch = (): void => { patchState.lastPatch = rawOps.lastApplied; };
  const snapSelection = () => selectionState?.snapshot() ?? EMPTY_SELECTION;
  const selectionAccess = {
    selectionEnabled,
    selectionMode,
    snapSelection,
    restoreSelection: (selection: ReturnType<typeof snapSelection>) => { selectionState?.restore(selection); },
  };
  const mutation = createDocumentMutationRuntime({
    schema,
    rawOps,
    historyLimit,
    historyState,
    patchState,
    selection: selectionAccess,
  });
  const { history, historyControls } = createDocumentHistoryRuntime({
    rawOps,
    historyState,
    selection: selectionAccess,
    syncLastPatch,
  });

  const ops: JSONStateOps<z.output<S>> = {
    add: (path, value) => mutation.applyDocumentPatch([{ op: "add", path, value }], undefined, true),
    remove: (path) => mutation.applyDocumentPatch([{ op: "remove", path }], undefined, true),
    replace: (path, value) => mutation.applyDocumentPatch([{ op: "replace", path, value }], undefined, true),
    move: (from, path) => mutation.applyDocumentPatch([{ op: "move", from, path }], undefined, true),
    copy: (from, path) => mutation.applyDocumentPatch([{ op: "copy", from, path }], undefined, true),
    test: rawOps.test,
    patch: mutation.applyDocumentPatch,
    load(value, loadOptions?: { preserveHistory?: boolean }) {
      const r = rawOps.load(value);
      const plan = planDocumentLifecycleChange({ result: r, preserveHistory: loadOptions?.preserveHistory === true });
      if (plan.syncLastPatch) syncLastPatch();
      if (plan.clearHistory) historyState.stack = emptyMutableHistory();
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      const plan = planDocumentLifecycleChange({ result: r, preserveHistory: false });
      if (plan.syncLastPatch) syncLastPatch();
      if (plan.clearHistory) historyState.stack = emptyMutableHistory();
      return r;
    },
    subscribe(listener) {
      const subscribePlan = planDocumentSubscriptionChange({
        event: "subscribe",
        subscriberCount: patchState.documentSubscriberCount,
        subscribed: false,
      });
      patchState.documentSubscriberCount = subscribePlan.subscriberCount;
      const unsubscribe = rawOps.subscribe((applied, metadata) => {
        patchState.lastPatch = applied;
        listener(applied, planDocumentSubscriptionMetadata({ metadata, selectionAfter: snapSelection() }));
      });
      let subscribed = subscribePlan.subscribed;
      return () => {
        const unsubscribePlan = planDocumentSubscriptionChange({
          event: "unsubscribe",
          subscriberCount: patchState.documentSubscriberCount,
          subscribed,
        });
        patchState.documentSubscriberCount = unsubscribePlan.subscriberCount;
        subscribed = unsubscribePlan.subscribed;
        if (unsubscribePlan.shouldCallUnderlyingUnsubscribe) unsubscribe();
      };
    },
    get state() { return rawOps.state; },
  };

  const activeSelection = selectionState;
  const selectionRef = activeSelection ? { get current() { return activeSelection; } } : undefined;
  const capabilities = buildDocumentCapabilities({
    schema,
    ops,
    previewPatch: rawOps.previewPatch,
    previewTrustedValuesPatch: rawOps.previewTrustedValuesPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
    history: historyControls,
    ...(selectionRef ? { selectionRef } : {}),
  });
  const clipboardOptions = {
    schema,
    getState: () => rawOps.state,
    ops,
    previewPatch: rawOps.previewPatch,
    previewTrustedValuesPatch: rawOps.previewTrustedValuesPatch,
    applyPreviewedPatch: mutation.applyPreviewedDocumentPatch,
    getSelectionSource: () => selectionState?.selectedSource ?? null,
    getSelectionTarget: () => selectionState?.primaryPointer ?? null,
    getAppliedPatch: () => patchState.lastPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
  };
  const clipboard = createClipboard(options.onChange === undefined ? clipboardOptions : { ...clipboardOptions, onChange: options.onChange });
  const restoreHistory = (direction: "undo" | "redo"): CapabilityResult => {
    const capability = direction === "undo" ? capabilities.undo : capabilities.redo;
    if (!capability.ok) return capability;
    const restored = direction === "undo" ? history.undo() : history.redo();
    return restored
      ? OK
      : {
          ok: false,
          code: "apply_failed",
          reason: `${direction} failed to apply history entry`,
        };
  };
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });
  function insert(pathOrValue: Pointer | unknown, maybeValue?: unknown): JSONDocumentEditResult {
    const args = planDocumentInsertArgs({
      pathOrValue,
      value: maybeValue,
      hasValueArg: arguments.length >= 2,
    });
    const target = args.target ?? selectionState?.primaryPointer ?? null;
    if (target === null) {
      return editError("empty_selection", "insert target selection is empty");
    }
    return mutation.patch({ op: "add", path: target, value: args.value });
  }
  function replace(pathOrValue: Pointer | unknown, maybeValue?: unknown): JSONDocumentEditResult {
    const args = planDocumentReplaceArgs({
      pathOrValue,
      value: maybeValue,
      hasValueArg: arguments.length >= 2,
    });
    const target = args.target ?? selectionState?.primaryPointer ?? null;
    if (target === null) {
      return editError("empty_selection", "replace target selection is empty");
    }
    if (target.startsWith("$")) {
      const capability = capabilities.find(target);
      if (!capability.ok) return capability;
      const matches = read.query(target);
      if (!matches.ok) return editError("syntax_error", matches.reason ?? `invalid JSONPath query: ${target}`);
      if (matches.pointers.length === 0) return editError("empty_match", `no matches for ${target}`);
      const operations: JSONPatchOperation[] = [...matches.pointers]
        .sort((a, b) => b.length - a.length)
        .map((path) => ({ op: "replace", path, value: args.value }));
      return mutation.patch(operations);
    }
    return mutation.patch({ op: "replace", path: target, value: args.value });
  }
  const deleteSelection = (source?: Pointer | ReadonlyArray<Pointer>): JSONDocumentEditResult => {
    const resolved = source ?? selectionState?.selectedSource ?? null;
    if (resolved === null) return editError("empty_selection", "delete source selection is empty");
    const planned = removeSourcesPatch(resolved);
    if (!planned.ok) {
      return planned.code === "invalid_pointer"
        ? editError("invalid_pointer", `invalid delete source pointer: ${planned.pointer}`, planned.pointer)
        : editError("empty_selection", "delete source selection is empty");
    }
    return mutation.patch(planned.patch);
  };
  const move = (sourceOrTarget: Pointer, maybeTarget?: Pointer): JSONDocumentEditResult => {
    const source = maybeTarget === undefined ? selectionState?.primaryPointer ?? null : sourceOrTarget;
    const target = maybeTarget ?? sourceOrTarget;
    if (source === null) return editError("empty_selection", "move source selection is empty");
    return mutation.patch({ op: "move", from: source, path: target });
  };
  const duplicate = (
    sourceOrOptions?: Pointer | JSONDocumentDuplicateOptions,
    maybeOptions?: JSONDocumentDuplicateOptions,
  ): JSONDocumentDuplicateResult<z.output<S>> => {
    const source = typeof sourceOrOptions === "string"
      ? sourceOrOptions
      : selectionState?.primaryPointer ?? null;
    const duplicateOptions = typeof sourceOrOptions === "string" ? maybeOptions : sourceOrOptions;
    if (source === null) {
      return {
        ok: false,
        code: "empty_selection",
        message: "duplicate source selection is empty",
      };
    }
    return mutation.duplicate(source, duplicateOptions);
  };

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...patchState.lastPatch]; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    clipboard,
    schema: schemaState,
    patch: mutation.patch,
    commit: mutation.commit,
    find: read.query,
    insert,
    replace,
    delete: deleteSelection,
    move,
    duplicate,
    copy: clipboard.copy,
    cut: clipboard.cut,
    paste: clipboard.paste,
    undo: () => restoreHistory("undo"),
    redo: () => restoreHistory("redo"),
    load: ops.load,
    reset: ops.reset,
    subscribe: ops.subscribe,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
    canPatch: (operations) => capabilities.patch(planDocumentPatchCall({ operations }).operations),
    canFind: capabilities.find,
    canInsert: capabilities.insert,
    canReplace: capabilities.replace,
    canDelete: capabilities.delete,
    canMove: capabilities.move,
    canDuplicate: capabilities.duplicate,
    canCopy: capabilities.copy,
    canCut: capabilities.cut,
    canPaste: (target, canPasteOptions) => {
      const pasteOptions = splitPasteOptions(canPasteOptions);
      if (pasteOptions.kind === "payload") {
        return capabilities.paste(pasteOptions.payload, target, pasteOptions.options);
      }
      if (target === undefined) {
        const buffered = clipboard[INTERNAL_CLIPBOARD_PEEK]();
        if (!buffered.ok) {
          return {
            ok: false,
            code: "empty_clipboard",
            reason: "clipboard is empty",
          };
        }
        const spread = pasteOptions.options?.spread ?? ((buffered.sources?.length ?? 0) > 1);
        return capabilities.paste(
          buffered.payload,
          undefined,
          { ...pasteOptions.options, spread },
          { trustedPayload: true },
        );
      }
      const plan = planDocumentCanPaste({
        schema,
        state: rawOps.state,
        clipboard: clipboard[INTERNAL_CLIPBOARD_PEEK](),
        target,
        ...(pasteOptions.options !== undefined ? { options: pasteOptions.options } : {}),
      });
      if (plan.kind === "result") return plan.result;
      return capabilities.paste(plan.payload, plan.target, plan.options, plan.executionOptions);
    },
    canUndo: () => capabilities.undo,
    canRedo: () => capabilities.redo,
  };
}

function splitPasteOptions(options?: JSONDocumentPasteOptions):
  | { kind: "clipboard"; options?: JSONDocumentPasteOptions }
  | { kind: "payload"; payload: unknown; options?: JSONDocumentPasteOptions } {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "payload")) {
    return options === undefined ? { kind: "clipboard" } : { kind: "clipboard", options };
  }
  const { payload, ...pasteOptions } = options;
  return Object.keys(pasteOptions).length === 0
    ? { kind: "payload", payload }
    : { kind: "payload", payload, options: pasteOptions };
}
