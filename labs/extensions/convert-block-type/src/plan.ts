import type { JSONCapabilityResult, JSONDocument, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";
import type { BlockTypeConversionDescriptor, BlockTypeConversionError, BlockTypeConversionErrorCode, BlockTypeConversionFactoryInput, BlockTypeConversionInput, BlockTypeConversionPlanResult } from "./types.js";

export function canConvertBlockType<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: BlockTypeConversionDescriptor,
  input: BlockTypeConversionInput,
): BlockTypeConversionPlanResult {
  const current = doc.at(input.pointer);
  if (!current.ok) {
    return conversionError("invalid_target", current.reason ?? `invalid conversion target: ${input.pointer}`, {
      pointer: current.pointer,
      to: input.to,
    });
  }

  const from = readType(descriptor, current.value, input.pointer);
  if (from === undefined) {
    return conversionError("unsupported_type", "source block type is not supported", {
      pointer: input.pointer,
      to: input.to,
    });
  }

  if (!descriptor.targetTypes.includes(input.to)) {
    return conversionError("invalid_target_type", `target type is not supported: ${input.to}`, {
      pointer: input.pointer,
      from,
      to: input.to,
    });
  }

  const factoryInput: BlockTypeConversionFactoryInput = createFactoryInput(input, from, current.value);
  const allowed = descriptor.canConvert?.(factoryInput);
  if (typeof allowed === "string") {
    return conversionError("invalid_target_type", allowed, { pointer: input.pointer, from, to: input.to });
  }
  if (allowed === false) {
    return conversionError("invalid_target_type", `cannot convert ${from} to ${input.to}`, {
      pointer: input.pointer,
      from,
      to: input.to,
    });
  }

  let nextValue: unknown;
  try {
    nextValue = descriptor.createValue(factoryInput);
  } catch (error) {
    return conversionError("factory_failed", error instanceof Error ? error.message : "block type conversion factory failed", {
      pointer: input.pointer,
      from,
      to: input.to,
    });
  }

  const operation: JSONPatchOperation = {
    op: "replace",
    path: input.pointer,
    value: cloneJson(nextValue),
  };
  const capability = doc.canPatch(operation);
  if (!capability.ok) return capabilityError(input.pointer, from, input.to, capability);

  return {
    ok: true,
    pointer: input.pointer,
    from,
    to: input.to,
    operation,
  };
}

export function readType(
  descriptor: BlockTypeConversionDescriptor,
  value: unknown,
  pointer: Pointer,
): string | undefined {
  const kind = descriptor.readType(value, pointer);
  return typeof kind === "string" && kind.length > 0 ? kind : undefined;
}

function createFactoryInput(
  input: BlockTypeConversionInput,
  from: string,
  value: unknown,
): BlockTypeConversionFactoryInput {
  const factoryInput: BlockTypeConversionFactoryInput = {
    pointer: input.pointer,
    from,
    to: input.to,
    value: cloneJson(value),
  };
  if (input.data !== undefined) factoryInput.data = cloneJson(input.data);
  return factoryInput;
}

function capabilityError(
  pointer: Pointer,
  from: string,
  to: string,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): BlockTypeConversionError {
  return conversionError("patch_rejected", capability.reason ?? "block type conversion patch rejected", {
    pointer: capability.pointer ?? pointer,
    from,
    to,
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

export function conversionError(
  code: BlockTypeConversionErrorCode,
  reason: string,
  options: {
    pointer?: Pointer;
    from?: string;
    to?: string;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): BlockTypeConversionError {
  return { ok: false, code, reason, ...(options.pointer === undefined ? {} : { pointer: options.pointer }), ...(options.from === undefined ? {} : { from: options.from }), ...(options.to === undefined ? {} : { to: options.to }), ...(options.capability === undefined ? {} : { capability: options.capability }), ...(options.result === undefined ? {} : { result: options.result }) };
}

export function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
