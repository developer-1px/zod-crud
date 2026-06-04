import type * as z from "zod";
import { query as jsonpathQuery } from "../../foundation/jsonpath/index.js";
import { parse as parseJSONPath } from "../../foundation/jsonpath/parse.js";
import { JSONPathSyntaxError } from "../../foundation/jsonpath/tokenize.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../foundation/patch/types.js";
import { appendSegment, parsePointer, readAt, tryParsePointer, type Pointer } from "../../foundation/pointer/index.js";
import {
  EMPTY_SELECTION,
  type SelectionSource,
  type SelectionSnap,
} from "../../domain/selection/types.js";
import {
  primaryPointer,
  selectedSource,
} from "../../domain/selection/read.js";
import { emptyMutableHistory } from "../../foundation/history.js";
import { removeSourcesPatch } from "../../foundation/patch/source.js";
import { patchPreflight, patchPreflightFromApplyResult } from "../../domain/schema/patch.js";
import { isPlainStructuralSchema } from "../../domain/schema/shared/schema.js";
import { schemaAtPointer } from "../../domain/schema/introspection.js";
import { getDef } from "../../domain/schema/zod.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOpts } from "../../domain/duplicate.js";
import { copy } from "../../domain/copy.js";
import { cut } from "../../domain/cut.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs } from "../../domain/paste.js";
import { deleteSelectionText, type SelectionTextDeleteOptions } from "../../domain/selection/textDelete.js";
import { replaceSelectionText, type SelectionTextEditOptions } from "../../domain/selection/textEdit.js";
import { INTERNAL_CLIPBOARD_PEEK, createClipboard } from "./clipboard/clipboard.js";
import { createJSONState } from "./state/json.js";
import { createSchemaState } from "./schema.js";
import { createSelection } from "./selection/create.js";
import {
  OK,
  type CapabilityResult,
  type DocumentCapabilitySourceResult,
} from "./can/result.js";
import type {
  EntriesResult,
  EntryKind,
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONDocumentDuplicateOptions,
  JSONDocumentDuplicateResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  JSONDocumentOptions,
  QueryResult,
  ReadEntry,
  ReadResult,
  SelectionOptions,
} from "./types.js";
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
type DocumentPathValueArgs = { target?: Pointer; value: unknown };
type CapabilityPasteExecutionOptions = { trustedPayload?: boolean };

interface DocumentCapabilities {
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

interface BuildDocumentCapabilitiesArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONStateOps<z.output<S>>;
  history: { canUndo(): boolean; canRedo(): boolean };
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  getStateJsonTrusted?: () => boolean;
  selectionRef?: { current: SelectionSnap };
}

function resolvePathValueArgs(
  pathOrValue: Pointer | unknown,
  value: unknown,
  hasValueArg: boolean,
): DocumentPathValueArgs {
  return hasValueArg
    ? { target: pathOrValue as Pointer, value }
    : { value: pathOrValue };
}

function buildDocumentCapabilities<S extends z.ZodType>(
  args: BuildDocumentCapabilitiesArgs<S>,
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
      const input = resolvePathValueArgs(pathOrValue, maybeValue, arguments.length >= 2);
      const target = input.target ?? primaryPointer(selection()) ?? null;
      return target === null
        ? emptySelectionCapability("insert target selection is empty")
        : patch([{ op: "add", path: target, value: input.value }]);
    },
    move(fromOrTo, maybeTo) {
      const hasSourceArg = arguments.length >= 2;
      const source = hasSourceArg ? fromOrTo : primaryPointer(selection()) ?? null;
      return source === null
        ? emptySelectionCapability("move source selection is empty")
        : patch([{ op: "move", from: source, path: hasSourceArg ? maybeTo! : fromOrTo }]);
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
      const resolved = source ?? selectedSource(selection()) ?? null;
      if (resolved === null) return emptySelectionCapability("delete source selection is empty");
      const planned = removeSourcesPatch(resolved);
      if (!planned.ok) {
        return planned.code === "invalid_pointer"
          ? { ok: false, code: "invalid_pointer", reason: `invalid delete source pointer: ${planned.pointer}`, pointer: planned.pointer }
          : emptySelectionCapability("delete source selection is empty");
      }
      return patch(planned.patch);
    },
    replace(pathOrValue, maybeValue) {
      const input = resolvePathValueArgs(pathOrValue, maybeValue, arguments.length >= 2);
      const target = input.target ?? primaryPointer(selection()) ?? null;
      if (target === null) return emptySelectionCapability("replace target selection is empty");
      if (target.startsWith("$")) {
        let pointers: Pointer[];
        try {
          pointers = jsonpathQuery(target, state());
        } catch (error) {
          if (error instanceof JSONPathSyntaxError) {
            return { ok: false, code: "syntax_error", reason: error.message };
          }
          throw error;
        }
        return pointers.length === 0
          ? { ok: false, code: "empty_match", reason: `no matches for ${target}` }
          : patch([...pointers]
              .sort((a, b) => b.length - a.length)
              .map((path) => ({ op: "replace", path, value: input.value })));
      }
      return patch([{ op: "replace", path: target, value: input.value }]);
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

function readDocumentPointer(state: unknown, path: Pointer): ReadResult {
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch (error) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: error instanceof Error ? error.message : "invalid pointer",
      pointer: path,
    };
  }

  const result = readAt(state, segments);
  return result.ok
    ? { ok: true, path, value: result.value }
    : {
        ok: false,
        code: "path_not_found",
        reason: `path not found: ${path}`,
        pointer: path,
      };
}

function queryDocumentPointers(state: unknown, jsonpath: string): QueryResult {
  try {
    return { ok: true, query: jsonpath, pointers: jsonpathQuery(jsonpath, state) };
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "invalid_query", reason: error.message };
    }
    throw error;
  }
}

function readDocumentEntries(schema: z.ZodType, state: unknown, path: Pointer): EntriesResult {
  const result = readDocumentPointer(state, path);
  if (!result.ok) return result;
  return {
    ok: true,
    path,
    kind: entryKind(schema, path, result.value),
    entries: readChildEntries(path, result.value),
  };
}

function entryKind(schema: z.ZodType, path: Pointer, value: unknown): EntryKind {
  if (path === "") return "root";
  if (Array.isArray(value)) return "array";
  if (isPlainRecord(value)) {
    const targetSchema = schemaAtPointer(schema, path);
    return targetSchema && getDef(targetSchema).type === "record" ? "record" : "object";
  }
  return "primitive";
}

function readChildEntries(path: Pointer, value: unknown): ReadonlyArray<ReadEntry> {
  if (Array.isArray(value)) {
    return value.map((entryValue, index) => ({
      key: String(index),
      path: appendSegment(path, index),
      value: entryValue,
    }));
  }
  if (isPlainRecord(value)) {
    return Object.entries(value).map(([key, entryValue]) => ({
      key,
      path: appendSegment(path, key),
      value: entryValue,
    }));
  }
  return [];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;
  const out: Extract<CapabilityResult, { ok: false }> = { ok: false, code: result.code };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
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
  const rawOps: TrustedDocumentStateOps<z.output<S>> = createJSONState(schema, initial, options);
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

  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: SelectionOptions = typeof options.selection === "object" ? options.selection : {};
  const createSelectionOptions: SelectionOptions & { onChange?: () => void; applyMetadataSelectionAfter: true } = {
    ...selectionOptions,
    applyMetadataSelectionAfter: true,
  };
  if (options.onChange !== undefined) createSelectionOptions.onChange = options.onChange;
  const selectionMode = selectionOptions.mode ?? "single";
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
      if (r.ok) {
        syncLastPatch();
        if (loadOptions?.preserveHistory !== true) historyState.stack = emptyMutableHistory();
      }
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      if (r.ok) {
        syncLastPatch();
        historyState.stack = emptyMutableHistory();
      }
      return r;
    },
    subscribe(listener) {
      patchState.documentSubscriberCount += 1;
      const unsubscribe = rawOps.subscribe((applied, metadata) => {
        patchState.lastPatch = applied;
        listener(applied, {
          ...metadata,
          selectionAfter: metadata?.selectionAfter ?? snapSelection(),
        });
      });
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        patchState.documentSubscriberCount = Math.max(0, patchState.documentSubscriberCount - 1);
        subscribed = false;
        unsubscribe();
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
  const readPointer = (path: Pointer): ReadResult => readDocumentPointer(rawOps.state, path);
  const queryPointers = (jsonpath: string): QueryResult => queryDocumentPointers(rawOps.state, jsonpath);
  const schemaState = createSchemaState(schema);
  function insert(pathOrValue: Pointer | unknown, maybeValue?: unknown): JSONDocumentEditResult {
    const args = resolvePathValueArgs(pathOrValue, maybeValue, arguments.length >= 2);
    const target = args.target ?? selectionState?.primaryPointer ?? null;
    if (target === null) {
      return editError("empty_selection", "insert target selection is empty");
    }
    return mutation.patch({ op: "add", path: target, value: args.value });
  }
  function replace(pathOrValue: Pointer | unknown, maybeValue?: unknown): JSONDocumentEditResult {
    const args = resolvePathValueArgs(pathOrValue, maybeValue, arguments.length >= 2);
    const target = args.target ?? selectionState?.primaryPointer ?? null;
    if (target === null) {
      return editError("empty_selection", "replace target selection is empty");
    }
    if (target.startsWith("$")) {
      const capability = capabilities.find(target);
      if (!capability.ok) return capability;
      const matches = queryPointers(target);
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
        reason: "duplicate source selection is empty",
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
    find: queryPointers,
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
    at: readPointer,
    exists: (path) => readPointer(path).ok,
    query: queryPointers,
    entries: (path) => readDocumentEntries(schema, rawOps.state, path),
    canPatch: (operations) => capabilities.patch(Array.isArray(operations) ? operations : [operations]),
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
      const buffered = clipboard[INTERNAL_CLIPBOARD_PEEK]();
      if (!buffered.ok) {
        return {
          ok: false,
          code: "empty_clipboard",
          reason: "clipboard is empty",
        };
      }
      const replaceTarget = typeof target === "object" && target !== null && "replace" in target ? target.replace : null;
      const replaceSegments = replaceTarget === null ? null : tryParsePointer(replaceTarget);
      if (
        buffered.schemaTrusted
        && buffered.source !== null
        && (buffered.sources?.length ?? 1) === 1
        && pasteOptions.options?.rekey === undefined
        && pasteOptions.options?.spread !== true
        && isPlainStructuralSchema(schema)
        && replaceTarget === buffered.source
        && replaceSegments !== null
        && readAt(rawOps.state, replaceSegments).ok
      ) {
        return OK;
      }
      const spread = pasteOptions.options?.spread ?? ((buffered.sources?.length ?? 0) > 1);
      return capabilities.paste(
        buffered.payload,
        target,
        { ...pasteOptions.options, spread },
        { trustedPayload: true },
      );
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
