import type * as z from "zod";
import { INTERNAL_CLIPBOARD_CAN_PASTE, createClipboard } from "./clipboard/clipboard.js";
import { createDocumentCapabilities } from "./can/create.js";
import { createDocumentEditActions } from "./edit/actions.js";
import { createJSONState } from "./state/json.js";
import { createDocumentStateOps } from "./state/ops.js";
import { createDocumentPatchRuntimeState } from "./state/runtime.js";
import { createSchemaState } from "./schema/state.js";
import { createDocumentSelectionRuntime } from "./selection/runtime.js";
import {
  OK,
  type CapabilityResult,
} from "./can/result.js";
import type {
  JSONDocument,
  JSONDocumentOptions,
} from "./types.js";
import { createDocumentRead } from "./read/read.js";
import { createDocumentMutationRuntime } from "./state/patch.js";
import { createDocumentHistoryRuntime } from "./history/undoRedo.js";
import { createDocumentHistoryRuntimeState } from "./history/state.js";
import type {
  TrustedDocumentStateOps,
} from "./state/types.js";

type TrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial?: false | undefined };

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
  const rawOps: TrustedDocumentStateOps<z.output<S>> = createJSONState(schema, initial, options);
  const historyLimit = options.history ?? 0;
  const historyState = createDocumentHistoryRuntimeState();
  const patchState = createDocumentPatchRuntimeState();

  const selectionRuntime = createDocumentSelectionRuntime({
    ops: rawOps,
    selection: options.selection,
    onChange: options.onChange,
  });
  const selectionState = selectionRuntime.state;
  const syncLastPatch = (): void => { patchState.lastPatch = rawOps.lastApplied; };
  const mutation = createDocumentMutationRuntime({
    schema,
    rawOps,
    historyLimit,
    historyState,
    patchState,
    selection: selectionRuntime.access,
  });
  const { history, historyControls } = createDocumentHistoryRuntime({
    rawOps,
    historyState,
    selection: selectionRuntime.access,
    syncLastPatch,
  });

  const ops = createDocumentStateOps({
    rawOps,
    mutation,
    historyState,
    patchState,
    snapSelection: selectionRuntime.access.snapSelection,
    syncLastPatch,
  });

  const capabilities = createDocumentCapabilities({
    schema,
    ops,
    previewPatch: rawOps.previewPatch,
    previewTrustedValuesPatch: rawOps.previewTrustedValuesPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
    history: historyControls,
    ...(selectionRuntime.ref ? { selectionRef: selectionRuntime.ref } : {}),
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
  const read = createDocumentRead(schema, () => rawOps.state);
  const schemaState = createSchemaState(schema);
  const edit = createDocumentEditActions({
    getState: () => rawOps.state,
    selection: selectionState,
    mutation,
  });

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...patchState.lastPatch]; },
    get selection() { return selectionRuntime.enabled ? selectionState : undefined; },
    history,
    clipboard,
    schema: schemaState,
    patch: mutation.patch,
    commit: mutation.commit,
    find: read.query,
    insert: edit.insert,
    replace: edit.replace,
    delete: edit.delete,
    move: edit.move,
    duplicate: edit.duplicate,
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
    canPatch: (operations) => capabilities.patch(Array.isArray(operations) ? operations : [operations]),
    canFind: capabilities.find,
    canInsert: capabilities.insert,
    canReplace: capabilities.replace,
    canDelete: capabilities.delete,
    canMove: capabilities.move,
    canDuplicate: capabilities.duplicate,
    canCopy: capabilities.copy,
    canCut: capabilities.cut,
    canPaste: (target, canPasteOptions) => clipboard[INTERNAL_CLIPBOARD_CAN_PASTE](target, canPasteOptions),
    canUndo: () => capabilities.undo,
    canRedo: () => capabilities.redo,
  };
}
