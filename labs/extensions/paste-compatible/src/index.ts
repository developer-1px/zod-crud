import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  Pointer,
} from "zod-crud";

export type CompatiblePasteOptions = Omit<JSONDocumentPasteOptions, "payload">;

export type CompatiblePasteErrorCode =
  | "adapter_failed"
  | "disabled"
  | "execution_failed"
  | "unsupported_payload";

export interface CompatiblePasteInput {
  payload: unknown;
  target: JSONDocumentPasteTarget;
  data?: Readonly<Record<string, unknown>>;
}

export interface CompatiblePasteAdapterInput {
  payload: unknown;
  target: JSONDocumentPasteTarget;
  data?: Readonly<Record<string, unknown>>;
}

export interface CompatiblePasteAdaptedPayload {
  ok: true;
  payload: unknown;
  options?: CompatiblePasteOptions;
  diagnostics?: ReadonlyArray<CompatiblePasteDiagnostic>;
}

export interface CompatiblePasteDiagnostic {
  code: string;
  reason: string;
  pointer?: Pointer;
}

export interface CompatiblePasteAdapterError {
  ok: false;
  code: "adapter_failed" | "unsupported_payload";
  reason: string;
  pointer?: Pointer;
  diagnostics?: ReadonlyArray<CompatiblePasteDiagnostic>;
}

export type CompatiblePasteAdapterResult =
  | CompatiblePasteAdaptedPayload
  | CompatiblePasteAdapterError;

export interface CompatiblePasteAdapter {
  adapt(input: CompatiblePasteAdapterInput): CompatiblePasteAdapterResult;
}

export interface CompatiblePastePlan {
  ok: true;
  input: CompatiblePasteInput;
  target: JSONDocumentPasteTarget;
  payload: unknown;
  options: CompatiblePasteOptions;
  capability: JSONCapabilityResult;
  diagnostics: ReadonlyArray<CompatiblePasteDiagnostic>;
}

export interface CompatiblePasteError {
  ok: false;
  code: CompatiblePasteErrorCode;
  reason: string;
  target?: JSONDocumentPasteTarget;
  pointer?: Pointer;
  diagnostics?: ReadonlyArray<CompatiblePasteDiagnostic>;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<ClipboardPasteResult<unknown>, { ok: true }>;
}

export type CompatiblePastePlanResult =
  | CompatiblePastePlan
  | CompatiblePasteError;

export type CompatiblePasteApplyResult<TDocument> =
  | {
      ok: true;
      input: CompatiblePasteInput;
      target: JSONDocumentPasteTarget;
      payload: unknown;
      options: CompatiblePasteOptions;
      result: ClipboardPasteResult<TDocument>;
      diagnostics: ReadonlyArray<CompatiblePasteDiagnostic>;
    }
  | CompatiblePasteError;

export interface CompatiblePaste<TDocument> {
  canPaste(input: CompatiblePasteInput): CompatiblePastePlanResult;
  paste(input: CompatiblePasteInput): CompatiblePasteApplyResult<TDocument>;
}

export function createCompatiblePaste<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: CompatiblePasteAdapter,
): CompatiblePaste<TDocument> {
  return {
    canPaste(input) {
      return canPasteCompatible(doc, adapter, input);
    },
    paste(input) {
      return pasteCompatible(doc, adapter, input);
    },
  };
}

export function canPasteCompatible<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: CompatiblePasteAdapter,
  input: CompatiblePasteInput,
): CompatiblePastePlanResult {
  let adapted: CompatiblePasteAdapterResult;
  try {
    adapted = adapter.adapt({
      payload: copyPayload(input.payload),
      target: copyPayload(input.target) as JSONDocumentPasteTarget,
      ...(input.data !== undefined ? { data: copyPayload(input.data) } : {}),
    });
  } catch (error) {
    return compatiblePasteError("adapter_failed", errorReason(error, "compatible paste adapter failed"), {
      target: input.target,
    });
  }
  if (!adapted.ok) {
    const options: {
      target: JSONDocumentPasteTarget;
      pointer?: Pointer;
      diagnostics?: ReadonlyArray<CompatiblePasteDiagnostic>;
    } = {
      target: input.target,
    };
    if (adapted.pointer !== undefined) options.pointer = adapted.pointer;
    if (adapted.diagnostics !== undefined) options.diagnostics = adapted.diagnostics;
    return compatiblePasteError(adapted.code, adapted.reason, options);
  }

  const payload = copyPayload(adapted.payload);
  const options = copyOptions(adapted.options);
  const capability = doc.canPaste(input.target, { ...options, payload });
  const diagnostics = copyDiagnostics(adapted.diagnostics);

  return {
    ok: true,
    input: copyInput(input),
    target: copyPayload(input.target) as JSONDocumentPasteTarget,
    payload,
    options,
    capability,
    diagnostics,
  };
}

export function pasteCompatible<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: CompatiblePasteAdapter,
  input: CompatiblePasteInput,
): CompatiblePasteApplyResult<TDocument> {
  const plan = canPasteCompatible(doc, adapter, input);
  if (!plan.ok) return plan;
  if (!plan.capability.ok) return disabled(plan);

  const result = doc.paste(plan.target, { ...plan.options, payload: copyPayload(plan.payload) });
  if (!result.ok) return executionFailed(plan, result);

  return {
    ok: true,
    input: copyInput(plan.input),
    target: copyPayload(plan.target) as JSONDocumentPasteTarget,
    payload: copyPayload(plan.payload),
    options: copyOptions(plan.options),
    result,
    diagnostics: copyDiagnostics(plan.diagnostics),
  };
}

function disabled(plan: CompatiblePastePlan): CompatiblePasteError {
  const capability = plan.capability as Exclude<JSONCapabilityResult, { ok: true }>;
  const options: {
    target: JSONDocumentPasteTarget;
    pointer?: Pointer;
    diagnostics: ReadonlyArray<CompatiblePasteDiagnostic>;
    capability: Exclude<JSONCapabilityResult, { ok: true }>;
  } = {
    target: plan.target,
    diagnostics: plan.diagnostics,
    capability,
  };
  if (capability.pointer !== undefined) options.pointer = capability.pointer;
  return compatiblePasteError("disabled", capability.reason ?? "compatible paste is disabled", options);
}

function executionFailed<TDocument>(
  plan: CompatiblePastePlan,
  result: Exclude<ClipboardPasteResult<TDocument>, { ok: true }>,
): CompatiblePasteError {
  return compatiblePasteError("execution_failed", pasteFailureReason(result), {
    target: plan.target,
    diagnostics: plan.diagnostics,
    result: result as Exclude<ClipboardPasteResult<unknown>, { ok: true }>,
  });
}

function compatiblePasteError(
  code: CompatiblePasteErrorCode,
  reason: string,
  options: {
    target?: JSONDocumentPasteTarget;
    pointer?: Pointer;
    diagnostics?: ReadonlyArray<CompatiblePasteDiagnostic>;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<ClipboardPasteResult<unknown>, { ok: true }>;
  } = {},
): CompatiblePasteError {
  const error: CompatiblePasteError = { ok: false, code, reason };
  if (options.target !== undefined) error.target = copyPayload(options.target) as JSONDocumentPasteTarget;
  if (options.pointer !== undefined) error.pointer = options.pointer;
  if (options.diagnostics !== undefined) error.diagnostics = copyDiagnostics(options.diagnostics);
  if (options.capability !== undefined) error.capability = options.capability;
  if (options.result !== undefined) error.result = options.result;
  return error;
}

function copyInput(input: CompatiblePasteInput): CompatiblePasteInput {
  const copy: CompatiblePasteInput = {
    payload: copyPayload(input.payload),
    target: copyPayload(input.target) as JSONDocumentPasteTarget,
  };
  if (input.data !== undefined) copy.data = copyPayload(input.data);
  return copy;
}

function copyOptions(options: CompatiblePasteOptions | undefined): CompatiblePasteOptions {
  if (options === undefined) return {};
  return copyPayload(options) as CompatiblePasteOptions;
}

function copyDiagnostics(
  diagnostics: ReadonlyArray<CompatiblePasteDiagnostic> | undefined,
): CompatiblePasteDiagnostic[] {
  if (diagnostics === undefined) return [];
  return diagnostics.map((diagnostic) => {
    const copy: CompatiblePasteDiagnostic = {
      code: diagnostic.code,
      reason: diagnostic.reason,
    };
    if (diagnostic.pointer !== undefined) copy.pointer = diagnostic.pointer;
    return copy;
  });
}

function copyPayload<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function pasteFailureReason(result: Exclude<ClipboardPasteResult<unknown>, { ok: true }>): string {
  if ("reason" in result && typeof result.reason === "string") return result.reason;
  if ("message" in result && typeof result.message === "string") return result.message;
  return "compatible paste execution failed";
}

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
