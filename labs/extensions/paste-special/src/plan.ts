import type { ClipboardPasteResult, JSONCapabilityResult, JSONDocument, JSONDocumentPasteTarget, Pointer } from "@interactive-os/json-document";
import type { PasteSpecialAdapter, PasteSpecialAdapterResult, PasteSpecialDiagnostic, PasteSpecialError, PasteSpecialErrorCode, PasteSpecialInput, PasteSpecialOptions, PasteSpecialPlanResult } from "./types.js";

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
    return pasteSpecialError("adapter_failed", error instanceof Error ? error.message : "paste special adapter failed", {
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

export function pasteSpecialError(
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

export function copyInput(input: PasteSpecialInput): PasteSpecialInput {
  const copy: PasteSpecialInput = {
    payload: copyPayload(input.payload),
    target: copyPayload(input.target) as JSONDocumentPasteTarget,
  };
  if (input.data !== undefined) copy.data = copyPayload(input.data);
  return copy;
}

export function copyOptions(options: PasteSpecialOptions | undefined): PasteSpecialOptions {
  if (options === undefined) return {};
  return copyPayload(options) as PasteSpecialOptions;
}

export function copyDiagnostics(
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

export function copyPayload<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
