import type * as z from "zod";
import type { JSONPatchOperation, JSONResult } from "../../foundation/patch/types.js";
import { EMPTY_SELECTION } from "../../domain/selection/types.js";
import { emptyMutableHistory } from "../../foundation/history.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard } from "./clipboard/clipboard.js";
import { createJSONState } from "./state/json.js";
import { buildReadFacade } from "./read.js";
import { createSchemaState } from "./schema.js";
import { createSelection } from "./selection/create.js";
import {
  canDocumentCopy,
  canDocumentCut,
  canDocumentDeleteText,
  canDocumentDuplicate,
  canDocumentExtendCursor,
  canDocumentFind,
  canDocumentMove,
  canDocumentMoveCursor,
  canDocumentPatch,
  canDocumentPaste,
  canDocumentRemove,
  canDocumentReplace,
  canDocumentReplaceText,
  canDocumentSelectScope,
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
  UseJSONDocumentOptions,
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
  DocumentPatchRuntimeState,
  TrustedDocumentStateOps,
} from "./state/document.js";
import type { HistoryTransactionOptions, JSONChangeMetadata, JSONStateOps } from "./state/types.js";

type TrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial?: false | undefined };

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
  options: UseJSONDocumentOptions = {},
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
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...patchState.lastPatch]; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    clipboard,
    schema: schemaState,
    patch: mutation.patch,
    commit: mutation.commit,
    duplicate: mutation.duplicate,
    load: ops.load,
    reset: ops.reset,
    subscribe: ops.subscribe,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
    canPatch: (operations) => capabilities.patch(planDocumentPatchCall({ operations }).operations),
    canFind: capabilities.find,
    canReplace: capabilities.replace,
    canRemove: capabilities.remove,
    canMove: capabilities.move,
    canDuplicate: capabilities.duplicate,
    canCopy: capabilities.copy,
    canCut: capabilities.cut,
    canPaste: (target, canPasteOptions) => {
      const plan = planDocumentCanPaste({
        schema,
        state: rawOps.state,
        clipboard: clipboard[INTERNAL_CLIPBOARD_PEEK](),
        target,
        ...(canPasteOptions !== undefined ? { options: canPasteOptions } : {}),
      });
      if (plan.kind === "result") return plan.result;
      return capabilities.paste(plan.payload, plan.target, plan.options, plan.executionOptions);
    },
    canPastePayload: (target, payload, canPasteOptions) => capabilities.paste(payload, target, canPasteOptions),
    canUndo: () => capabilities.undo,
    canRedo: () => capabilities.redo,
  };
}
