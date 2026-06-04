import type {
  ClipboardPasteResult,
  JSONCapabilityResult,
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  Pointer,
} from "zod-crud";

export type PasteSpecialOptions = Omit<JSONDocumentPasteOptions, "payload">;

export type PasteSpecialErrorCode =
  | "adapter_failed"
  | "disabled"
  | "execution_failed"
  | "unsupported_payload";

export interface PasteSpecialInput {
  payload: unknown;
  target: JSONDocumentPasteTarget;
  data?: Readonly<Record<string, unknown>>;
}

export interface PasteSpecialAdapterInput {
  payload: unknown;
  target: JSONDocumentPasteTarget;
  data?: Readonly<Record<string, unknown>>;
}

export interface PasteSpecialAdaptedPayload {
  ok: true;
  payload: unknown;
  options?: PasteSpecialOptions;
  diagnostics?: ReadonlyArray<PasteSpecialDiagnostic>;
}

export interface PasteSpecialDiagnostic {
  code: string;
  reason: string;
  pointer?: Pointer;
}

export interface PasteSpecialAdapterError {
  ok: false;
  code: "adapter_failed" | "unsupported_payload";
  reason: string;
  pointer?: Pointer;
  diagnostics?: ReadonlyArray<PasteSpecialDiagnostic>;
}

export type PasteSpecialAdapterResult =
  | PasteSpecialAdaptedPayload
  | PasteSpecialAdapterError;

export interface PasteSpecialAdapter {
  adapt(input: PasteSpecialAdapterInput): PasteSpecialAdapterResult;
}

export interface PasteSpecialPlan {
  ok: true;
  input: PasteSpecialInput;
  target: JSONDocumentPasteTarget;
  payload: unknown;
  options: PasteSpecialOptions;
  capability: JSONCapabilityResult;
  diagnostics: ReadonlyArray<PasteSpecialDiagnostic>;
}

export interface PasteSpecialError {
  ok: false;
  code: PasteSpecialErrorCode;
  reason: string;
  target?: JSONDocumentPasteTarget;
  pointer?: Pointer;
  diagnostics?: ReadonlyArray<PasteSpecialDiagnostic>;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<ClipboardPasteResult<unknown>, { ok: true }>;
}

export type PasteSpecialPlanResult =
  | PasteSpecialPlan
  | PasteSpecialError;

export type PasteSpecialApplyResult<TDocument> =
  | {
      ok: true;
      input: PasteSpecialInput;
      target: JSONDocumentPasteTarget;
      payload: unknown;
      options: PasteSpecialOptions;
      result: ClipboardPasteResult<TDocument>;
      diagnostics: ReadonlyArray<PasteSpecialDiagnostic>;
    }
  | PasteSpecialError;

export interface PasteSpecial<TDocument> {
  canPaste(input: PasteSpecialInput): PasteSpecialPlanResult;
  paste(input: PasteSpecialInput): PasteSpecialApplyResult<TDocument>;
}

export function createPasteSpecial<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: PasteSpecialAdapter,
): PasteSpecial<TDocument> {
  return {
    canPaste: (input) => canPasteSpecial(doc, adapter, input),
    paste: (input) => pasteSpecial(doc, adapter, input),
  };
}

export function canPasteSpecial<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: PasteSpecialAdapter,
  input: PasteSpecialInput,
): PasteSpecialPlanResult {
  let adapted: PasteSpecialAdapterResult;
  try {
    adapted = adapter.adapt({
      payload: copyPayload(input.payload),
      target: copyPayload(input.target) as JSONDocumentPasteTarget,
      ...(input.data !== undefined ? { data: copyPayload(input.data) } : {}),
    });
  } catch (error) {
    return pasteSpecialError("adapter_failed", errorReason(error, "paste special adapter failed"), {
      target: input.target,
    });
  }
  if (!adapted.ok) {
    const options: {
      target: JSONDocumentPasteTarget;
      pointer?: Pointer;
      diagnostics?: ReadonlyArray<PasteSpecialDiagnostic>;
    } = {
      target: input.target,
    };
    if (adapted.pointer !== undefined) options.pointer = adapted.pointer;
    if (adapted.diagnostics !== undefined) options.diagnostics = adapted.diagnostics;
    return pasteSpecialError(adapted.code, adapted.reason, options);
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

export function pasteSpecial<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: PasteSpecialAdapter,
  input: PasteSpecialInput,
): PasteSpecialApplyResult<TDocument> {
  const plan = canPasteSpecial(doc, adapter, input);
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

function disabled(plan: PasteSpecialPlan): PasteSpecialError {
  const capability = plan.capability as Exclude<JSONCapabilityResult, { ok: true }>;
  const options: {
    target: JSONDocumentPasteTarget;
    pointer?: Pointer;
    diagnostics: ReadonlyArray<PasteSpecialDiagnostic>;
    capability: Exclude<JSONCapabilityResult, { ok: true }>;
  } = {
    target: plan.target,
    diagnostics: plan.diagnostics,
    capability,
  };
  if (capability.pointer !== undefined) options.pointer = capability.pointer;
  return pasteSpecialError("disabled", capability.reason ?? "paste special is disabled", options);
}

function executionFailed<TDocument>(
  plan: PasteSpecialPlan,
  result: Exclude<ClipboardPasteResult<TDocument>, { ok: true }>,
): PasteSpecialError {
  return pasteSpecialError("execution_failed", pasteFailureReason(result), {
    target: plan.target,
    diagnostics: plan.diagnostics,
    result: result as Exclude<ClipboardPasteResult<unknown>, { ok: true }>,
  });
}

function pasteSpecialError(
  code: PasteSpecialErrorCode,
  reason: string,
  options: {
    target?: JSONDocumentPasteTarget;
    pointer?: Pointer;
    diagnostics?: ReadonlyArray<PasteSpecialDiagnostic>;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<ClipboardPasteResult<unknown>, { ok: true }>;
  } = {},
): PasteSpecialError {
  return { ok: false, code, reason, ...(options.target === undefined ? {} : { target: copyPayload(options.target) as JSONDocumentPasteTarget }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }), ...(options.diagnostics === undefined ? {} : { diagnostics: copyDiagnostics(options.diagnostics) }), ...(options.capability === undefined ? {} : { capability: options.capability }), ...(options.result === undefined ? {} : { result: options.result }) };
}

function copyInput(input: PasteSpecialInput): PasteSpecialInput {
  const copy: PasteSpecialInput = {
    payload: copyPayload(input.payload),
    target: copyPayload(input.target) as JSONDocumentPasteTarget,
  };
  if (input.data !== undefined) copy.data = copyPayload(input.data);
  return copy;
}

function copyOptions(options: PasteSpecialOptions | undefined): PasteSpecialOptions {
  if (options === undefined) return {};
  return copyPayload(options) as PasteSpecialOptions;
}

function copyDiagnostics(
  diagnostics: ReadonlyArray<PasteSpecialDiagnostic> | undefined,
): PasteSpecialDiagnostic[] {
  if (diagnostics === undefined) return [];
  return diagnostics.map((diagnostic) => {
    const copy: PasteSpecialDiagnostic = {
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
  return "paste special execution failed";
}

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
