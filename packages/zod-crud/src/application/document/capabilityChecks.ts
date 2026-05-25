import type * as z from "zod";

import { query as jsonpathQuery } from "../../foundation/jsonpath/index.js";
import { parse as parseJSONPath } from "../../foundation/jsonpath/parser.js";
import { JSONPathSyntaxError } from "../../foundation/jsonpath/tokenizer.js";
import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/types.js";
import { removeSourcesPatch } from "../../foundation/json-patch/removeSources.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { PointerSourceError } from "../../foundation/json-pointer/pointerSource.js";
import {
  patchPreflight,
  patchPreflightFromApplyResult,
} from "../../domain/schema/patchPreflight.js";
import {
  primaryPointer,
  selectedSource,
} from "../../domain/selection/selectionRead.js";
import { resolveSelectionScope } from "../../domain/selection/selectionOrder.js";
import { resolveSelectionCursor } from "../../domain/selection/selectionReducer.js";
import {
  EMPTY_SELECTION,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionScopeOptions,
  type SelectionSource,
  type SelectionSnap,
} from "../../domain/selection/selectionTypes.js";
import {
  deleteSelectionText,
  type SelectionTextDeleteOptions,
} from "../../domain/selection/textDelete.js";
import {
  replaceSelectionText,
  type SelectionTextEditOptions,
} from "../../domain/selection/textEdit.js";
import { copy, type ClipboardSource } from "../../domain/verbs/copy.js";
import { cut } from "../../domain/verbs/cut.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOpts } from "../../domain/verbs/duplicate.js";
import {
  paste,
  rekeyProducesTrustedPayload,
  resolvePasteArgs,
  type PasteOptions,
  type PasteTarget,
} from "../../domain/verbs/paste.js";
import type { HistoryTransactionOptions } from "./stateOps.js";
import {
  OK,
  type CapabilityResult,
  type DocumentCapabilitySourceResult,
} from "./capabilityResultTypes.js";
import {
  type CapabilityPasteExecutionOptions,
  type DocumentCapabilityContext,
} from "./capabilityFacadeTypes.js";

interface PlanDocumentPatchCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<JSONPatchOperation>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentRemoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: SelectionSource;
  selectionSource?: SelectionSource | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentReplaceCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  value: unknown;
  target?: Pointer;
  selectionTarget?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentReplaceArgsInput {
  pathOrValue: Pointer | unknown;
  value: unknown;
  hasValueArg: boolean;
}

type DocumentReplaceArgsPlan = { target?: Pointer; value: unknown };

interface ResolvedMoveArgs {
  from?: Pointer;
  to: Pointer;
}

interface PlanDocumentReplaceTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  replacement: string;
  options?: SelectionTextEditOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentDeleteTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  options?: SelectionTextDeleteOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentMoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  target: Pointer;
  source?: Pointer;
  selectionSource?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentDuplicateCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: Pointer;
  selectionSource?: Pointer | null;
  options?: DuplicateOpts;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentCopyCapabilityInput {
  state: unknown;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
}

interface PlanDocumentCutCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: ClipboardSource;
  selectionSource?: ClipboardSource | null;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

interface PlanDocumentPasteCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  payload: unknown;
  selectionTarget?: Pointer | null;
  target?: PasteTarget;
  options?: PasteOptions;
  trustedPayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export function planDocumentCapabilityResult(result: DocumentCapabilitySourceResult): CapabilityResult {
  if (result.ok) return OK;

  const out: Extract<CapabilityResult, { ok: false }> = {
    ok: false,
    code: result.code,
  };
  const reason = result.reason ?? result.message;
  if (reason !== undefined) out.reason = reason;
  if (result.pointer !== undefined && result.pointer !== null) out.pointer = result.pointer;
  if (result.violations !== undefined) out.violations = result.violations;
  return out;
}

export function planDocumentMoveCapability<S extends z.ZodType>(
  input: PlanDocumentMoveCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  if (source === null) return emptySelectionCapability("move source selection is empty");
  const operation: JSONPatchOperation = { op: "move", from: source, path: input.target };
  return planDocumentPatchCapability({
    schema: input.schema,
    state: input.state,
    operations: [operation],
    ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
  });
}

export function planDocumentDuplicateCapability<S extends z.ZodType>(
  input: PlanDocumentDuplicateCapabilityInput<S>,
): CapabilityResult {
  const source = input.source ?? input.selectionSource ?? null;
  return source === null
    ? emptySelectionCapability("duplicate source selection is empty")
    : planDocumentCapabilityResult(duplicate(input.schema, input.state, source, input.options, {
        previewPatch: input.previewPatch,
        trustedPayload: input.stateJsonTrusted === true,
      }));
}

export function planDocumentRemoveCapability<S extends z.ZodType>(
  input: PlanDocumentRemoveCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  if (resolved === null) return emptySelectionCapability("remove source selection is empty");
  const planned = removeSourcesPatch(resolved);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(pointerSourceCapabilityError(planned, "remove"));
}

export function planDocumentReplaceCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceCapabilityInput<S>,
): CapabilityResult {
  if (input.target !== undefined && isDocumentJSONPathTarget(input.target)) {
    return planDocumentJSONPathReplaceCapability({
      schema: input.schema,
      state: input.state,
      target: input.target,
      value: input.value,
      ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
    });
  }
  const target = input.target ?? input.selectionTarget ?? null;
  return target === null
    ? emptySelectionCapability("replace target selection is empty")
    : planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: [{ op: "replace", path: target, value: input.value }],
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      });
}

export function planDocumentReplaceTextCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceTextCapabilityInput<S>,
): CapabilityResult {
  const planned = replaceSelectionText(input.selection, input.state, input.replacement, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function planDocumentDeleteTextCapability<S extends z.ZodType>(
  input: PlanDocumentDeleteTextCapabilityInput<S>,
): CapabilityResult {
  const planned = deleteSelectionText(input.selection, input.state, input.options);
  return planned.ok
    ? planDocumentPatchCapability({
        schema: input.schema,
        state: input.state,
        operations: planned.patch,
        ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
      })
    : planDocumentCapabilityResult(planned);
}

export function planDocumentPatchCapability<S extends z.ZodType>(
  input: PlanDocumentPatchCapabilityInput<S>,
): CapabilityResult {
  const result = input.previewPatch
    ? patchPreflightFromApplyResult(input.previewPatch(input.operations))
    : patchPreflight(input.schema, input.state, input.operations);
  return planDocumentCapabilityResult(result);
}

export function planDocumentReplaceArgs(
  input: PlanDocumentReplaceArgsInput,
): DocumentReplaceArgsPlan {
  return input.hasValueArg
    ? { target: input.pathOrValue as Pointer, value: input.value }
    : { value: input.pathOrValue };
}

export function planDocumentCutCapability<S extends z.ZodType>(
  input: PlanDocumentCutCapabilityInput<S>,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelectionCapability("cut source selection is empty")
    : planDocumentCapabilityResult(cut(input.schema, input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
        previewPatch: input.previewPatch,
      }));
}

export function planDocumentCopyCapability(
  input: PlanDocumentCopyCapabilityInput,
): CapabilityResult {
  const resolved = input.source ?? input.selectionSource ?? null;
  return resolved === null
    ? emptySelectionCapability("copy source selection is empty")
    : planDocumentCapabilityResult(copy(input.state, resolved, {
        trusted: input.stateJsonTrusted === true,
        clonePayload: false,
      }));
}

export function planDocumentPasteCapability<S extends z.ZodType>(
  input: PlanDocumentPasteCapabilityInput<S>,
): CapabilityResult {
  const args = resolvePasteArgs(input.target, input.options);
  const resolvedTarget = args.target ?? input.selectionTarget ?? null;
  const inputTrustedPayload = input.trustedPayload === true
    || args.options.trustedPayload === true;
  const patchValuesTrusted = inputTrustedPayload
    || rekeyProducesTrustedPayload(args.options);
  const pastePreview = patchValuesTrusted && input.previewTrustedValuesPatch
    ? input.previewTrustedValuesPatch
    : input.previewPatch;
  return resolvedTarget === null
    ? emptySelectionCapability("paste target selection is empty")
    : planDocumentCapabilityResult(paste(input.schema, input.state, input.payload, resolvedTarget, args.mode, {
        ...args.options,
        previewPatch: pastePreview,
        trustedPayload: inputTrustedPayload,
      }));
}

function emptySelectionCapability(reason: string): CapabilityResult {
  return {
    ok: false,
    code: "empty_selection",
    reason,
  };
}

function pointerSourceCapabilityError(
  error: PointerSourceError,
  label: string,
): DocumentCapabilitySourceResult {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", reason: `invalid ${label} source pointer: ${error.pointer}`, pointer: error.pointer }
    : { ok: false, code: "empty_selection", reason: `${label} source selection is empty` };
}

function isDocumentJSONPathTarget(value: Pointer): boolean {
  return value.startsWith("$");
}

function resolveMoveArgs(
  fromOrTo: Pointer,
  to: Pointer | undefined,
  hasToArg: boolean,
): ResolvedMoveArgs {
  return hasToArg ? { from: fromOrTo, to: to! } : { to: fromOrTo };
}

function planDocumentJSONPathReplaceCapability<S extends z.ZodType>(
  input: PlanDocumentReplaceCapabilityInput<S> & { target: Pointer },
): CapabilityResult {
  let pointers: Pointer[];
  try {
    pointers = jsonpathQuery(input.target, input.state);
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return planDocumentCapabilityResult({ ok: false, code: "syntax_error", message: error.message });
    }
    throw error;
  }

  if (pointers.length === 0) {
    return planDocumentCapabilityResult({
      ok: false,
      code: "empty_match",
      message: `no matches for ${input.target}`,
    });
  }

  const operations: JSONPatchOperation[] = [...pointers]
    .sort((a, b) => b.length - a.length)
    .map((path) => ({ op: "replace", path, value: input.value }));
  return planDocumentPatchCapability({
    schema: input.schema,
    state: input.state,
    operations,
    ...(input.previewPatch !== undefined ? { previewPatch: input.previewPatch } : {}),
  });
}

export function canDocumentFind(jsonpath: string): CapabilityResult {
  try {
    parseJSONPath(jsonpath);
    return OK;
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message };
    }
    throw error;
  }
}

export function canDocumentSelectScope<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  options?: SelectionScopeOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionScope(context.state, options));
}

export function canDocumentMoveCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(context.selection ?? EMPTY_SELECTION, direction, context.state, options));
}

export function canDocumentExtendCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(context.selection ?? EMPTY_SELECTION, direction, context.state, options));
}

export function canDocumentMove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  fromOrTo: Pointer,
  maybeTo?: Pointer,
  hasToArg = arguments.length >= 3,
): CapabilityResult {
  const args = resolveMoveArgs(fromOrTo, maybeTo, hasToArg);
  return planDocumentMoveCapability({
    schema: context.schema,
    state: context.state,
    target: args.to,
    selectionSource: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(args.from !== undefined ? { source: args.from } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentDuplicate<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  sourceOrOpts?: Pointer | DuplicateOpts,
  opts?: DuplicateOpts,
): CapabilityResult {
  const args = resolveDuplicateArgs(sourceOrOpts, opts);
  return planDocumentDuplicateCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: primaryPointer(context.selection ?? EMPTY_SELECTION),
    options: args.opts,
    stateJsonTrusted: context.stateJsonTrusted === true,
    ...(args.source !== undefined ? { source: args.source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentRemove<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: SelectionSource,
): CapabilityResult {
  return planDocumentRemoveCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentReplace<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  pathOrValue: Pointer | unknown,
  maybeValue?: unknown,
  hasValueArg = arguments.length >= 3,
): CapabilityResult {
  const args = planDocumentReplaceArgs({
    pathOrValue,
    value: maybeValue,
    hasValueArg,
  });
  return planDocumentReplaceCapability({
    schema: context.schema,
    state: context.state,
    value: args.value,
    selectionTarget: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(args.target !== undefined ? { target: args.target } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentReplaceText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  replacement: string,
  textOptions?: SelectionTextEditOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentReplaceTextCapability({
    schema: context.schema,
    state: context.state,
    selection: context.selection ?? EMPTY_SELECTION,
    replacement,
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentDeleteText<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  textOptions?: SelectionTextDeleteOptions & HistoryTransactionOptions,
): CapabilityResult {
  return planDocumentDeleteTextCapability({
    schema: context.schema,
    state: context.state,
    selection: context.selection ?? EMPTY_SELECTION,
    ...(textOptions !== undefined ? { options: textOptions } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentPatch<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  operations: ReadonlyArray<JSONPatchOperation>,
): CapabilityResult {
  return planDocumentPatchCapability({
    schema: context.schema,
    state: context.state,
    operations,
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentCut<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCutCapability({
    schema: context.schema,
    state: context.state,
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    stateJsonTrusted: context.stateJsonTrusted === true,
    ...(source !== undefined ? { source } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
  });
}

export function canDocumentCopy<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  source?: ClipboardSource,
): CapabilityResult {
  return planDocumentCopyCapability({
    state: context.state,
    selectionSource: selectedSource(context.selection ?? EMPTY_SELECTION),
    stateJsonTrusted: context.stateJsonTrusted === true,
    ...(source !== undefined ? { source } : {}),
  });
}

export function canDocumentPaste<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  payload: unknown,
  target?: PasteTarget,
  options?: PasteOptions,
  executionOptions?: CapabilityPasteExecutionOptions,
): CapabilityResult {
  return planDocumentPasteCapability({
    schema: context.schema,
    state: context.state,
    payload,
    selectionTarget: primaryPointer(context.selection ?? EMPTY_SELECTION),
    ...(target !== undefined ? { target } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(executionOptions?.trustedPayload !== undefined ? { trustedPayload: executionOptions.trustedPayload } : {}),
    ...(context.previewPatch !== undefined ? { previewPatch: context.previewPatch } : {}),
    ...(context.previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch: context.previewTrustedValuesPatch } : {}),
  });
}
