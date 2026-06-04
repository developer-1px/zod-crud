import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type IncrementNumberErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_number"
  | "patch_rejected"
  | "patch_failed";

export interface IncrementNumberError {
  ok: false;
  code: IncrementNumberErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface IncrementNumberOptions {
  /** Amount to add (default 1). Use a negative step or `decrement` to go down. */
  step?: number;
  /** Clamp the result to at least this value. */
  min?: number;
  /** Clamp the result to at most this value. */
  max?: number;
}

export interface IncrementNumberChange {
  ok: true;
  pointer: Pointer;
  from: number;
  to: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type IncrementNumberResult = IncrementNumberChange | IncrementNumberError;

export interface IncrementNumber<TDocument> {
  canStep(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  step(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  increment(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
  decrement(pointer: Pointer, options?: IncrementNumberOptions): IncrementNumberResult;
}

export function createIncrementNumber<TDocument>(doc: JSONDocument<TDocument>): IncrementNumber<TDocument> {
  return {
    canStep: (pointer, options) => canStep(doc, pointer, options),
    step: (pointer, options) => step(doc, pointer, options),
    increment: (pointer, options) => step(doc, pointer, options),
    decrement(pointer, options) {
      return step(doc, pointer, { ...options, step: -(options?.step ?? 1) });
    },
  };
}

export function canStep<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: IncrementNumberOptions,
): IncrementNumberResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `increment-number path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "number" || Number.isNaN(current)) {
    return error("not_a_number", `field is not a number: ${pointer}`, pointer);
  }

  const delta = options?.step ?? 1;
  let next = current + delta;
  if (options?.min !== undefined) next = Math.max(options.min, next);
  if (options?.max !== undefined) next = Math.min(options.max, next);

  const changed = next !== current;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: next }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function step<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: IncrementNumberOptions,
): IncrementNumberResult {
  const change = canStep(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): IncrementNumberError {
  const result: IncrementNumberError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `increment-number patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): IncrementNumberError {
  const result: IncrementNumberError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `increment-number patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: IncrementNumberErrorCode, reason: string, pointer?: Pointer): IncrementNumberError {
  const result: IncrementNumberError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
