// Headless JSONDocument facade.
// React 의존 없이 useJSONDocument 와 같은 편집 표면을 제공한다.

import type * as z from "zod";

import { buildCheck, type CheckResult } from "./check.js";
import type {
  JSONPatchOperation,
  JSONResult,
} from "../../foundation/json-patch/index.js";
import { computeInverses } from "../../foundation/json-patch/inverse.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import {
  EMPTY_SELECTION,
  reduceSelection,
  restoreSelection,
  type SelectionAction,
  type SelectionMode,
  type SelectionSource,
  type SelectionSnap,
} from "../../domain/selection/index.js";
import {
  backEntry,
  canRedoMutable,
  canUndoMutable,
  commitMutable as commitHistory,
  emptyMutableHistory,
  forwardEntry,
  historyDepth,
  mergeLastMutable,
  moveBack,
  moveForward,
  redoDepth,
  type MutableHistoryStack,
} from "../../foundation/history.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard, type ClipboardPeekResult, type ClipboardState } from "./clipboard.js";
import { createJSON } from "./createJSON.js";
import { buildReadFacade, type EntriesResult, type QueryResult, type ReadResult } from "./read.js";
import { createSchemaState, type SchemaState } from "./schema.js";
import { createSelection, type SelectionState, type UseSelectionOptions } from "./selection.js";
import { isPlainStructuralSchemaForLocalValidation } from "../../domain/schema/localPatch.js";
import {
  duplicate as duplicateVerb,
  type DuplicateError,
  type DuplicateOpts,
} from "../../domain/verbs/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../domain/verbs/paste.js";
import type { JSONCrudError } from "../../foundation/errors.js";
import type {
  HistoryTransactionOptions,
  JSONChangeMetadata,
  JSONOps,
} from "./ops.js";

export interface UseJSONDocumentOptions {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
  history?: number;
  selection?: boolean | UseSelectionOptions;
  onChange?: () => void;
}

export interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  undo(): boolean;
  redo(): boolean;
  mergeLast(options?: { mergeKey?: string }): boolean;
  transaction(fn: () => void): void;
  transaction(options: HistoryTransactionOptions, fn: () => void): void;
}

export interface JSONDocumentCommitOptions extends HistoryTransactionOptions {
  /**
   * Final model selection for this edit. When present, it overrides mutation
   * auto-selection and is recorded in the same history entry as the patch.
   */
  selection?: SelectionAction | SelectionSnap;
}

export type JSONPatchInput = JSONPatchOperation | ReadonlyArray<JSONPatchOperation>;
export type JSONCapabilityResult = CheckResult;
export type JSONDocumentDuplicateOptions = DuplicateOpts;
export type JSONDocumentDuplicateResult<T> =
  | {
      ok: true;
      value: T;
      applied: ReadonlyArray<JSONPatchOperation>;
      duplicatedTo: Pointer;
    }
  | DuplicateError
  | Extract<JSONResult, { ok: false }>;
export type JSONDocumentPasteOptions = PasteOptions;
export type JSONDocumentPasteTarget = PasteTarget;

export interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: ReadonlyArray<JSONPatchOperation>;
  readonly selection: SelectionState | undefined;
  readonly history: JSONDocumentHistory;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState;
  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: ReadonlyArray<JSONPatchOperation>, options?: JSONDocumentCommitOptions): JSONResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
  canPatch(operations: JSONPatchInput): JSONCapabilityResult;
  canFind(jsonpath: string): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canRemove(source: SelectionSource): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source: SelectionSource): JSONCapabilityResult;
  canCut(source: SelectionSource): JSONCapabilityResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canPastePayload(target: JSONDocumentPasteTarget, payload: unknown, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}

interface HistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
}

export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions = {},
): JSONDocument<z.output<S>> {
  const json = createJSON(schema, initial, options);
  const rawOps = json.ops;
  const historyLimit = options.history ?? 0;
  let stack: MutableHistoryStack<HistoryEntry> = emptyMutableHistory<HistoryEntry>();
  let isRestoring = false;
  let activeHistoryMetadata: HistoryTransactionOptions | undefined;
  let lastPatch: ReadonlyArray<JSONPatchOperation> = [];
  let documentSubscriberCount = 0;

  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof options.selection === "object" ? options.selection : {};
  const selectionMode = selectionOptions.mode ?? "single";

  const createSelectionOptions: UseSelectionOptions & {
    onChange?: () => void;
    applyMetadataSelectionAfter?: boolean;
  } = {
    ...selectionOptions,
    applyMetadataSelectionAfter: true,
  };
  if (options.onChange !== undefined) {
    createSelectionOptions.onChange = options.onChange;
  }
  const selectionState = selectionEnabled
    ? createSelection<z.output<S>>(rawOps, createSelectionOptions)
    : undefined;
  const syncLastPatch = (): void => {
    lastPatch = rawOps.lastApplied;
  };
  const snapSelection = (): SelectionSnap => selectionState?.snapshot() ?? EMPTY_SELECTION;
  const shouldCaptureSelectionMetadata = (
    shouldRecordHistory: boolean,
    metadata?: JSONChangeMetadata,
  ): boolean =>
    shouldRecordHistory
    || activeHistoryMetadata !== undefined
    || metadata !== undefined
    || (selectionEnabled && documentSubscriberCount > 0);

  const recordHistory = (
    before: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    selectionBefore: SelectionSnap,
    selectionAfter: SelectionSnap,
    metadata?: HistoryTransactionOptions,
    operationsOwned = false,
  ): void => {
    const inverse = computeInverses(before, operations);
    if (!inverse.ok) return;
    const entry: HistoryEntry = {
      forward: operationsOwned ? operations as JSONPatchOperation[] : [...operations],
      inverse: inverse.inverses,
      selectionBefore,
      selectionAfter,
    };
    if (metadata !== undefined) {
      const historyMetadata = compactHistoryMetadata(metadata);
      if (historyMetadata) entry.metadata = historyMetadata;
    }
    commitHistory(stack, entry, historyLimit);
  };

  const applyDocumentPatch = (
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
    operationsOwned = false,
  ): JSONResult => {
    const shouldRecordHistory = historyLimit > 0 && !isRestoring && operations.length > 0;
    const shouldCaptureMetadata = shouldCaptureSelectionMetadata(shouldRecordHistory, metadata);
    if (!shouldCaptureMetadata) {
      const r = rawOps.patch(operations);
      if (r.ok) lastPatch = operations.length === 0 ? [] : rawOps.lastApplied;
      return r;
    }

    const before = shouldRecordHistory ? rawOps.state : undefined;
    const selectionBefore = snapSelection();
    const changeMetadata = activeHistoryMetadata !== undefined || metadata !== undefined || selectionEnabled
      ? buildChangeMetadata(activeHistoryMetadata, metadata, selectionBefore, selectionEnabled)
      : undefined;
    const r = rawOps.patch(operations, changeMetadata);
    const selectionAfter = snapSelection();
    if (r.ok) lastPatch = operations.length === 0 ? [] : rawOps.lastApplied;
    if (r.ok && shouldRecordHistory) {
      recordHistory(before!, operations, selectionBefore, selectionAfter, changeMetadata, operationsOwned);
    }
    return r;
  };
  const applyPreviewedDocumentPatch = (
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ): JSONResult => {
    const shouldRecordHistory = historyLimit > 0 && !isRestoring && operations.length > 0;
    const shouldCaptureMetadata = shouldCaptureSelectionMetadata(shouldRecordHistory, metadata);
    if (!shouldCaptureMetadata) {
      const r = rawOps.trustedApply(next, applied);
      if (r.ok) lastPatch = applied.length === 0 ? [] : rawOps.lastApplied;
      return r;
    }

    const before = shouldRecordHistory ? rawOps.state : undefined;
    const selectionBefore = snapSelection();
    const changeMetadata = activeHistoryMetadata !== undefined || metadata !== undefined || selectionEnabled
      ? buildChangeMetadata(activeHistoryMetadata, metadata, selectionBefore, selectionEnabled)
      : undefined;
    const r = rawOps.trustedApply(next, applied, changeMetadata);
    const selectionAfter = snapSelection();
    if (r.ok) lastPatch = applied.length === 0 ? [] : rawOps.lastApplied;
    if (r.ok && shouldRecordHistory) {
      recordHistory(before!, operations, selectionBefore, selectionAfter, changeMetadata);
    }
    return r;
  };
  const patch = (operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult =>
    isPatchArray(operations)
      ? applyDocumentPatch(operations, metadata)
      : applyDocumentPatch([operations], metadata, true);

  const commit = (
    operations: ReadonlyArray<JSONPatchOperation>,
    commitOptions?: JSONDocumentCommitOptions,
  ): JSONResult => {
    if (commitOptions === undefined) return applyDocumentPatch(operations);

    const { selection } = commitOptions;
    const metadataOptions = compactHistoryMetadata(commitOptions);
    if (selection === undefined) return applyDocumentPatch(operations, metadataOptions);

    const before = rawOps.state;
    const selectionBefore = snapSelection();
    const predicted = rawOps.previewPatch(operations);
    if (!predicted.result.ok) return patch(operations, metadataOptions);

    const selectionAfter = resolveCommitSelection(selectionBefore, selection, predicted.state, selectionMode);
    const directMetadata = metadataOptions === undefined
      ? { selectionAfter }
      : { ...metadataOptions, selectionAfter };
    const changeMetadata = buildChangeMetadata(
      activeHistoryMetadata,
      directMetadata,
      selectionBefore,
      selectionEnabled,
    );
    const r = rawOps.trustedApply(predicted.state, predicted.applied, changeMetadata);
    if (!r.ok) return r;

    lastPatch = operations.length === 0 ? [] : rawOps.lastApplied;
    selectionState?.restore(selectionAfter);
    if (historyLimit > 0 && !isRestoring && operations.length > 0) {
      recordHistory(before, operations, selectionBefore, selectionAfter, changeMetadata);
    }
    return r;
  };

  const duplicate = (
    source: Pointer,
    duplicateOptions?: JSONDocumentDuplicateOptions,
  ): JSONDocumentDuplicateResult<z.output<S>> => {
    const before = rawOps.state;
    const planned = duplicateVerb(schema, before, source, duplicateOptions, {
      previewPatch: rawOps.previewPatch,
      trustedPayload: rawOps.stateJsonTrusted,
    });
    if (!planned.ok) return planned;
    const shouldRecordHistory = historyLimit > 0 && !isRestoring && planned.patch.length > 0;
    const shouldCaptureMetadata = shouldCaptureSelectionMetadata(shouldRecordHistory);
    const selectionBefore = shouldCaptureMetadata ? snapSelection() : EMPTY_SELECTION;
    const changeMetadata = shouldCaptureMetadata
      ? buildChangeMetadata(activeHistoryMetadata, undefined, selectionBefore, selectionEnabled)
      : undefined;
    const r = rawOps.trustedApply(planned.next, planned.patch, changeMetadata);
    const selectionAfter = shouldCaptureMetadata ? snapSelection() : EMPTY_SELECTION;
    if (r.ok) lastPatch = planned.patch.length === 0 ? [] : rawOps.lastApplied;
    if (r.ok && shouldRecordHistory) {
      recordHistory(before, planned.patch, selectionBefore, selectionAfter, changeMetadata);
    }
    return r.ok
      ? {
          ok: true,
          value: rawOps.state,
          applied: lastPatch,
          duplicatedTo: planned.duplicatedTo,
        }
      : r;
  };

  const restore = (direction: "undo" | "redo"): boolean => {
    const entry = direction === "undo" ? backEntry(stack) : forwardEntry(stack);
    if (!entry) return false;
    if (direction === "undo") entry.selectionAfter = snapSelection();
    isRestoring = true;
    try {
      const r = rawOps.trustedPatch(direction === "undo" ? entry.inverse : entry.forward);
      if (!r.ok) return false;
      syncLastPatch();
    } catch {
      return false;
    } finally {
      isRestoring = false;
    }
    if (direction === "undo") moveBack(stack);
    else moveForward(stack);
    selectionState?.restore(direction === "undo" ? entry.selectionBefore : entry.selectionAfter);
    return true;
  };

  const ops: JSONOps<z.output<S>> = {
    add: (path, value) => applyDocumentPatch([{ op: "add", path: path as Pointer, value }], undefined, true),
    remove: (path) => applyDocumentPatch([{ op: "remove", path: path as Pointer }], undefined, true),
    replace: (path, value) => applyDocumentPatch([{ op: "replace", path: path as Pointer, value }], undefined, true),
    move: (from, path) => applyDocumentPatch([{ op: "move", from: from as Pointer, path: path as Pointer }], undefined, true),
    copy: (from, path) => applyDocumentPatch([{ op: "copy", from: from as Pointer, path: path as Pointer }], undefined, true),
    test: rawOps.test,
    patch: applyDocumentPatch,
    load(value, loadOptions?: { preserveHistory?: boolean }) {
      const r = rawOps.load(value);
      if (r.ok) syncLastPatch();
      if (r.ok && !loadOptions?.preserveHistory) stack = emptyMutableHistory<HistoryEntry>();
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      if (r.ok) syncLastPatch();
      if (r.ok) stack = emptyMutableHistory<HistoryEntry>();
      return r;
    },
    subscribe(listener) {
      documentSubscriberCount += 1;
      const unsubscribe = rawOps.subscribe((applied, metadata) => {
        lastPatch = applied;
        listener(applied, {
          ...metadata,
          selectionAfter: metadata?.selectionAfter ?? snapSelection(),
        });
      });
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        documentSubscriberCount -= 1;
        unsubscribe();
      };
    },
    get state() { return rawOps.state; },
  };

  const historyControls = {
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => canUndoMutable(stack),
    canRedo: () => canRedoMutable(stack),
  };

  const mergeLast = (mergeOptions?: { mergeKey?: string }): boolean => {
    if (isRestoring) return false;
    return mergeLastMutable(stack, (prev, top) => {
      const metadata = mergeEntryMetadata(prev, top, mergeOptions);
      return mergeHistoryEntries(prev, top, metadata);
    });
  };

  const mergeTransactionEntries = (depthBefore: number): void => {
    if (historyDepth(stack) <= depthBefore + 1) return;

    const start = stack.undoStart + depthBefore;
    const end = stack.undo.length;
    if (start < stack.undoStart || end - start <= 1) return;

    const first = stack.undo[start]!;
    const last = stack.undo[end - 1]!;
    let forwardLength = 0;
    let inverseLength = 0;
    let metadata: HistoryTransactionOptions | undefined;
    let repeatedReplacePath: Pointer | false | null = null;
    let repeatedReplaceForward: JSONPatchOperation | undefined;
    let repeatedReplaceInverse: JSONPatchOperation | undefined;

    for (let index = start; index < end; index += 1) {
      const entry = stack.undo[index]!;
      forwardLength += entry.forward.length;
      inverseLength += entry.inverse.length;
      if (entry.metadata !== undefined) {
        metadata = metadata === undefined
          ? entry.metadata
          : { ...metadata, ...entry.metadata };
      }

      if (repeatedReplacePath !== false) {
        const forward = entry.forward.length === 1 ? entry.forward[0] : undefined;
        const inverse = entry.inverse.length === 1 ? entry.inverse[0] : undefined;
        if (
          forward?.op === "replace"
          && inverse?.op === "replace"
          && forward.path === inverse.path
          && (repeatedReplacePath === null || repeatedReplacePath === forward.path)
        ) {
          repeatedReplacePath = forward.path;
          repeatedReplaceForward = forward;
          repeatedReplaceInverse ??= inverse;
        } else {
          repeatedReplacePath = false;
        }
      }
    }

    if (
      repeatedReplacePath !== false
      && repeatedReplaceForward !== undefined
      && repeatedReplaceInverse !== undefined
    ) {
      const merged: HistoryEntry = {
        forward: [repeatedReplaceForward],
        inverse: [repeatedReplaceInverse],
        selectionBefore: first.selectionBefore,
        selectionAfter: last.selectionAfter,
      };
      if (metadata !== undefined) merged.metadata = metadata;
      stack.undo[start] = merged;
      stack.undo.length = start + 1;
      return;
    }

    const forward = new Array<JSONPatchOperation>(forwardLength);
    let forwardIndex = 0;
    for (let entryIndex = start; entryIndex < end; entryIndex += 1) {
      const entryForward = stack.undo[entryIndex]!.forward;
      for (let index = 0; index < entryForward.length; index += 1) {
        forward[forwardIndex] = entryForward[index]!;
        forwardIndex += 1;
      }
    }

    const inverse = new Array<JSONPatchOperation>(inverseLength);
    let inverseIndex = 0;
    for (let entryIndex = end - 1; entryIndex >= start; entryIndex -= 1) {
      const entryInverse = stack.undo[entryIndex]!.inverse;
      for (let index = 0; index < entryInverse.length; index += 1) {
        inverse[inverseIndex] = entryInverse[index]!;
        inverseIndex += 1;
      }
    }

    const merged: HistoryEntry = {
      forward,
      inverse,
      selectionBefore: first.selectionBefore,
      selectionAfter: last.selectionAfter,
    };
    if (metadata !== undefined) merged.metadata = metadata;
    stack.undo[start] = merged;
    stack.undo.length = start + 1;
  };

  const withHistoryMetadata = (metadata: HistoryTransactionOptions | undefined, fn: () => void): void => {
    const previous = activeHistoryMetadata;
    activeHistoryMetadata = metadata ? { ...previous, ...metadata } : previous;
    try {
      fn();
    } finally {
      activeHistoryMetadata = previous;
    }
  };

  const transaction = (
    optionsOrFn: HistoryTransactionOptions | (() => void),
    maybeFn?: () => void,
  ): void => {
    const hasOptions = typeof optionsOrFn !== "function";
    const transactionOptions = hasOptions ? optionsOrFn : undefined;
    const fn = hasOptions ? maybeFn : optionsOrFn;
    if (!fn) return;
    const depthBefore = historyDepth(stack);
    withHistoryMetadata(transactionOptions, fn);
    mergeTransactionEntries(depthBefore);
  };

  const history: JSONDocumentHistory = {
    get canUndo() { return historyControls.canUndo(); },
    get canRedo() { return historyControls.canRedo(); },
    get undoDepth() { return historyDepth(stack); },
    get redoDepth() { return redoDepth(stack); },
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    mergeLast,
    transaction,
  };

  const activeSelection = selectionState;
  const selectionRef = activeSelection
    ? { get current() { return activeSelection; } }
    : undefined;
  const check = buildCheck({
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
    applyPreviewedPatch: applyPreviewedDocumentPatch,
    getSelectionSource: () => selectionState?.selectedSource ?? null,
    getSelectionTarget: () => selectionState?.primaryPointer ?? null,
    getAppliedPatch: () => lastPatch,
    getStateJsonTrusted: () => rawOps.stateJsonTrusted,
  };
  const clipboard = createClipboard(options.onChange === undefined
    ? clipboardOptions
    : { ...clipboardOptions, onChange: options.onChange });
  const read = buildReadFacade({ schema, getState: () => rawOps.state });
  const schemaState = createSchemaState({ schema });

  return {
    get value() { return rawOps.state; },
    get lastPatch() { return [...lastPatch]; },
    get selection() { return selectionEnabled ? selectionState : undefined; },
    history,
    clipboard,
    schema: schemaState,
    patch,
    commit,
    duplicate,
    load: ops.load,
    reset: ops.reset,
    subscribe: ops.subscribe,
    at: read.at,
    exists: read.exists,
    query: read.query,
    entries: read.entries,
    canPatch: (operations) => check.patch(normalizePatchInput(operations)),
    canFind: check.find,
    canReplace: check.replace,
    canRemove: check.remove,
    canMove: check.move,
    canDuplicate: check.duplicate,
    canCopy: check.copy,
    canCut: check.cut,
    canPaste: (target, canPasteOptions) => {
      const read = clipboard[INTERNAL_CLIPBOARD_PEEK]();
      if (!read.ok) {
        return {
          ok: false,
          code: "empty_clipboard",
          reason: "clipboard is empty",
        };
      }
      if (canTrustSameSourceReplaceCanPaste(schema, rawOps.state, read, target, canPasteOptions)) {
        return { ok: true };
      }
      const spread = canPasteOptions?.spread ?? ((read.sources?.length ?? 0) > 1);
      return check.paste(
        read.payload,
        target,
        { ...canPasteOptions, spread },
        { trustedPayload: true },
      );
    },
    canPastePayload: (target, payload, canPasteOptions) => check.paste(payload, target, canPasteOptions),
    canUndo: () => check.undo,
    canRedo: () => check.redo,
  };
}

function canTrustSameSourceReplaceCanPaste<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  read: Extract<ClipboardPeekResult, { ok: true }>,
  target: JSONDocumentPasteTarget,
  options?: JSONDocumentPasteOptions,
): boolean {
  if (!read.schemaTrusted || read.source === null) return false;
  if ((read.sources?.length ?? 1) !== 1) return false;
  if (options?.rekey !== undefined || options?.spread === true) return false;
  if (!isPlainStructuralSchemaForLocalValidation(schema)) return false;

  const replaceTarget = replacePointerTarget(target);
  if (replaceTarget === null || replaceTarget !== read.source) return false;
  const segments = tryParsePointer(replaceTarget);
  return segments !== null && readAt(state, segments).ok;
}

function replacePointerTarget(target: JSONDocumentPasteTarget): Pointer | null {
  return typeof target === "object" && target !== null && "replace" in target
    ? target.replace
    : null;
}

function normalizePatchInput(operations: JSONPatchInput): ReadonlyArray<JSONPatchOperation> {
  return isPatchArray(operations) ? operations : [operations];
}

function isPatchArray(operations: JSONPatchInput): operations is ReadonlyArray<JSONPatchOperation> {
  return Array.isArray(operations);
}

function resolveCommitSelection(
  current: SelectionSnap,
  selection: SelectionAction | SelectionSnap,
  state: unknown,
  mode: SelectionMode,
): SelectionSnap {
  return isSelectionSnap(selection)
    ? restoreSelection(selection, mode, state)
    : reduceSelection(current, selection, mode, state);
}

function isSelectionSnap(selection: SelectionAction | SelectionSnap): selection is SelectionSnap {
  return typeof selection === "object"
    && selection !== null
    && "selectionRanges" in selection
    && "selectedPointers" in selection
    && "primaryIndex" in selection;
}

function buildChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
  selectionBefore: SelectionSnap,
  includeSelectionBefore: boolean,
): JSONChangeMetadata | undefined {
  const metadata = mergeChangeMetadata(active, direct);
  if (!includeSelectionBefore && metadata === undefined) return undefined;
  return {
    ...metadata,
    selectionBefore,
  };
}

function mergeChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
): JSONChangeMetadata | undefined {
  if (active === undefined) return direct;
  if (direct === undefined) return active;
  return { ...active, ...direct };
}

function compactHistoryMetadata(
  metadata: HistoryTransactionOptions | undefined,
): HistoryTransactionOptions | undefined {
  if (metadata === undefined) return undefined;
  const { label, origin, mergeKey } = metadata;
  if (label === undefined && origin === undefined && mergeKey === undefined) return undefined;

  const compact: HistoryTransactionOptions = {};
  if (label !== undefined) compact.label = label;
  if (origin !== undefined) compact.origin = origin;
  if (mergeKey !== undefined) compact.mergeKey = mergeKey;
  return compact;
}

function mergeEntryMetadata(
  prev: HistoryEntry,
  top: HistoryEntry,
  options?: { mergeKey?: string },
): HistoryTransactionOptions | undefined {
  if (prev.metadata === undefined && top.metadata === undefined && options === undefined) {
    return undefined;
  }
  const merged = { ...prev.metadata, ...top.metadata, ...options };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeHistoryEntries(
  prev: HistoryEntry,
  top: HistoryEntry,
  metadata?: HistoryTransactionOptions,
): HistoryEntry {
  const compact = compactRepeatedReplaceHistory(prev, top, metadata);
  if (compact !== null) return compact;
  return {
    forward: [...prev.forward, ...top.forward],
    inverse: [...top.inverse, ...prev.inverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
    ...(metadata ? { metadata } : {}),
  };
}

function compactRepeatedReplaceHistory(
  prev: HistoryEntry,
  top: HistoryEntry,
  metadata?: HistoryTransactionOptions,
): HistoryEntry | null {
  if (
    prev.forward.length !== 1
    || prev.inverse.length !== 1
    || top.forward.length !== 1
    || top.inverse.length !== 1
  ) {
    return null;
  }

  const prevForward = prev.forward[0]!;
  const prevInverse = prev.inverse[0]!;
  const topForward = top.forward[0]!;
  const topInverse = top.inverse[0]!;
  if (
    prevForward.op !== "replace"
    || prevInverse.op !== "replace"
    || topForward.op !== "replace"
    || topInverse.op !== "replace"
    || prevForward.path !== prevInverse.path
    || topForward.path !== topInverse.path
    || prevForward.path !== topForward.path
  ) {
    return null;
  }

  return {
    forward: [topForward],
    inverse: [prevInverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
    ...(metadata ? { metadata } : {}),
  };
}
