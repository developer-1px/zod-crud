import type * as z from "zod";
import { buildDocumentCapabilities } from "./capability.js";
import type { JSONPatchOperation, JSONResult } from "../../foundation/json-patch/types.js";
import { EMPTY_SELECTION } from "../../domain/selection/selectionTypes.js";
import { emptyMutableHistory } from "../../foundation/history.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard } from "./clipboard.js";
import { createJSONState } from "./jsonState.js";
import { buildReadFacade } from "./read.js";
import { createSchemaState } from "./schema.js";
import { createSelection } from "./selection.js";
import type {
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONPatchInput,
  UseJSONDocumentOptions,
} from "./createJSONDocumentPublicTypes.js";
import { planDocumentCanPaste, planDocumentPatchCall, planDocumentSelectionRuntime } from "./createJSONDocumentInteractionPlan.js";
import {
  planDocumentLifecycleChange,
  planDocumentSubscriptionChange,
  planDocumentSubscriptionMetadata,
} from "./createJSONDocumentChangePlan.js";
import { createDocumentMutationRuntime } from "./createJSONDocumentMutationRuntime.js";
import { createDocumentHistoryRuntime } from "./createJSONDocumentHistoryRuntime.js";
import type {
  DocumentHistoryRuntimeState,
  DocumentPatchRuntimeState,
  TrustedDocumentStateOps,
} from "./createJSONDocumentRuntimeTypes.js";
import type { HistoryTransactionOptions, JSONChangeMetadata, JSONStateOps } from "./stateOps.js";

type TrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = UseJSONDocumentOptions & { trustedInitial?: false | undefined };

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
