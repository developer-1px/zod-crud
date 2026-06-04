import {
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type BlockTypeConversionErrorCode =
  | "factory_failed"
  | "invalid_target"
  | "invalid_target_type"
  | "patch_failed"
  | "patch_rejected"
  | "unsupported_type";

export interface BlockTypeConversionDescriptor {
  targetTypes: ReadonlyArray<string>;
  readType(value: unknown, pointer: Pointer): string | undefined;
  canConvert?(input: BlockTypeConversionFactoryInput): boolean | string;
  createValue(input: BlockTypeConversionFactoryInput): unknown;
}

export interface BlockTypeConversionInput {
  pointer: Pointer;
  to: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface BlockTypeConversionFactoryInput {
  pointer: Pointer;
  from: string;
  to: string;
  value: unknown;
  data?: Readonly<Record<string, unknown>>;
}

export interface BlockTypeConversionPlan {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  operation: JSONPatchOperation;
}

export interface BlockTypeConversionError {
  ok: false;
  code: BlockTypeConversionErrorCode;
  reason: string;
  pointer?: Pointer;
  from?: string;
  to?: string;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type BlockTypeConversionPlanResult =
  | BlockTypeConversionPlan
  | BlockTypeConversionError;

export type BlockTypeConversionResult =
  | { ok: true; pointer: Pointer; from: string; to: string; operation: JSONPatchOperation; result: JSONResult }
  | BlockTypeConversionError;

export interface BlockTypeConverter<TDocument> {
  canConvert(input: BlockTypeConversionInput): BlockTypeConversionPlanResult;
  convert(input: BlockTypeConversionInput, metadata?: JSONChangeMetadata): BlockTypeConversionResult;
}

export function createBlockTypeConverter<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: BlockTypeConversionDescriptor,
): BlockTypeConverter<TDocument> {
  return {
    canConvert: (input) => canConvertBlockType(doc, descriptor, input),
    convert: (input, metadata) => convertBlockType(doc, descriptor, input, metadata),
  };
}

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
    return conversionError("factory_failed", errorReason(error, "block type conversion factory failed"), {
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

export function convertBlockType<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: BlockTypeConversionDescriptor,
  input: BlockTypeConversionInput,
  metadata?: JSONChangeMetadata,
): BlockTypeConversionResult {
  const plan = canConvertBlockType(doc, descriptor, input);
  if (!plan.ok) return plan;

  const result = doc.patch(plan.operation, metadata);
  if (!result.ok) return patchError(plan, result);

  return {
    ok: true,
    pointer: plan.pointer,
    from: plan.from,
    to: plan.to,
    operation: copyOperation(plan.operation),
    result,
  };
}

function readType(
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

function patchError(
  plan: BlockTypeConversionPlan,
  result: Exclude<JSONResult, { ok: true }>,
): BlockTypeConversionError {
  return conversionError("patch_failed", result.reason ?? "block type conversion patch failed", {
    pointer: result.pointer ?? plan.pointer,
    from: plan.from,
    to: plan.to,
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

function conversionError(
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
  const error: BlockTypeConversionError = { ok: false, code, reason };
  if (options.pointer !== undefined) error.pointer = options.pointer;
  if (options.from !== undefined) error.from = options.from;
  if (options.to !== undefined) error.to = options.to;
  if (options.capability !== undefined) error.capability = options.capability;
  if (options.result !== undefined) error.result = options.result;
  return error;
}

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function copyOperation(operation: JSONPatchOperation): JSONPatchOperation {
  return cloneJson(operation) as JSONPatchOperation;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
