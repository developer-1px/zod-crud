import {
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type NodeKindConversionErrorCode =
  | "factory_failed"
  | "invalid_target"
  | "invalid_target_kind"
  | "patch_failed"
  | "patch_rejected"
  | "unsupported_kind";

export interface NodeKindConversionDescriptor {
  targetKinds: ReadonlyArray<string>;
  readKind(value: unknown, pointer: Pointer): string | undefined;
  canConvert?(input: NodeKindConversionFactoryInput): boolean | string;
  createValue(input: NodeKindConversionFactoryInput): unknown;
}

export interface NodeKindConversionInput {
  pointer: Pointer;
  to: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface NodeKindConversionFactoryInput {
  pointer: Pointer;
  from: string;
  to: string;
  value: unknown;
  data?: Readonly<Record<string, unknown>>;
}

export interface NodeKindConversionPlan {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  operation: JSONPatchOperation;
}

export interface NodeKindConversionError {
  ok: false;
  code: NodeKindConversionErrorCode;
  reason: string;
  pointer?: Pointer;
  from?: string;
  to?: string;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type NodeKindConversionPlanResult =
  | NodeKindConversionPlan
  | NodeKindConversionError;

export type NodeKindConversionResult =
  | { ok: true; pointer: Pointer; from: string; to: string; operation: JSONPatchOperation; result: JSONResult }
  | NodeKindConversionError;

export interface NodeKindConverter<TDocument> {
  canConvert(input: NodeKindConversionInput): NodeKindConversionPlanResult;
  convert(input: NodeKindConversionInput, metadata?: JSONChangeMetadata): NodeKindConversionResult;
}

export function createNodeKindConverter<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: NodeKindConversionDescriptor,
): NodeKindConverter<TDocument> {
  return {
    canConvert(input) {
      return canConvertNodeKind(doc, descriptor, input);
    },
    convert(input, metadata) {
      return convertNodeKind(doc, descriptor, input, metadata);
    },
  };
}

export function canConvertNodeKind<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: NodeKindConversionDescriptor,
  input: NodeKindConversionInput,
): NodeKindConversionPlanResult {
  const current = doc.at(input.pointer);
  if (!current.ok) {
    return conversionError("invalid_target", current.reason ?? `invalid conversion target: ${input.pointer}`, {
      pointer: current.pointer,
      to: input.to,
    });
  }

  const from = readKind(descriptor, current.value, input.pointer);
  if (from === undefined) {
    return conversionError("unsupported_kind", "source node kind is not supported", {
      pointer: input.pointer,
      to: input.to,
    });
  }

  if (!descriptor.targetKinds.includes(input.to)) {
    return conversionError("invalid_target_kind", `target kind is not supported: ${input.to}`, {
      pointer: input.pointer,
      from,
      to: input.to,
    });
  }

  const factoryInput: NodeKindConversionFactoryInput = createFactoryInput(input, from, current.value);
  const allowed = descriptor.canConvert?.(factoryInput);
  if (typeof allowed === "string") {
    return conversionError("invalid_target_kind", allowed, { pointer: input.pointer, from, to: input.to });
  }
  if (allowed === false) {
    return conversionError("invalid_target_kind", `cannot convert ${from} to ${input.to}`, {
      pointer: input.pointer,
      from,
      to: input.to,
    });
  }

  let nextValue: unknown;
  try {
    nextValue = descriptor.createValue(factoryInput);
  } catch (error) {
    return conversionError("factory_failed", errorReason(error, "node kind conversion factory failed"), {
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

export function convertNodeKind<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: NodeKindConversionDescriptor,
  input: NodeKindConversionInput,
  metadata?: JSONChangeMetadata,
): NodeKindConversionResult {
  const plan = canConvertNodeKind(doc, descriptor, input);
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

function readKind(
  descriptor: NodeKindConversionDescriptor,
  value: unknown,
  pointer: Pointer,
): string | undefined {
  const kind = descriptor.readKind(value, pointer);
  return typeof kind === "string" && kind.length > 0 ? kind : undefined;
}

function createFactoryInput(
  input: NodeKindConversionInput,
  from: string,
  value: unknown,
): NodeKindConversionFactoryInput {
  const factoryInput: NodeKindConversionFactoryInput = {
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
): NodeKindConversionError {
  return conversionError("patch_rejected", capability.reason ?? "node kind conversion patch rejected", {
    pointer: capability.pointer ?? pointer,
    from,
    to,
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

function patchError(
  plan: NodeKindConversionPlan,
  result: Exclude<JSONResult, { ok: true }>,
): NodeKindConversionError {
  return conversionError("patch_failed", result.reason ?? "node kind conversion patch failed", {
    pointer: result.pointer ?? plan.pointer,
    from: plan.from,
    to: plan.to,
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

function conversionError(
  code: NodeKindConversionErrorCode,
  reason: string,
  options: {
    pointer?: Pointer;
    from?: string;
    to?: string;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): NodeKindConversionError {
  const error: NodeKindConversionError = { ok: false, code, reason };
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
