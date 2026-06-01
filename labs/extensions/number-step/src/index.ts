import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type NumberStepErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_number"
  | "patch_rejected"
  | "patch_failed";

export interface NumberStepError {
  ok: false;
  code: NumberStepErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface NumberStepOptions {
  /** Amount to add (default 1). Use a negative step or `decrement` to go down. */
  step?: number;
  /** Clamp the result to at least this value. */
  min?: number;
  /** Clamp the result to at most this value. */
  max?: number;
}

export interface NumberStepChange {
  ok: true;
  pointer: Pointer;
  from: number;
  to: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type NumberStepResult = NumberStepChange | NumberStepError;

export interface NumberStep<TDocument> {
  canStep(pointer: Pointer, options?: NumberStepOptions): NumberStepResult;
  step(pointer: Pointer, options?: NumberStepOptions): NumberStepResult;
  increment(pointer: Pointer, options?: NumberStepOptions): NumberStepResult;
  decrement(pointer: Pointer, options?: NumberStepOptions): NumberStepResult;
}

export function createNumberStep<TDocument>(doc: JSONDocument<TDocument>): NumberStep<TDocument> {
  return {
    canStep(pointer, options) {
      return canStep(doc, pointer, options);
    },
    step(pointer, options) {
      return step(doc, pointer, options);
    },
    increment(pointer, options) {
      return step(doc, pointer, options);
    },
    decrement(pointer, options) {
      return step(doc, pointer, { ...options, step: -(options?.step ?? 1) });
    },
  };
}

export function canStep<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: NumberStepOptions,
): NumberStepResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `number-step path not found: ${pointer}`, read.pointer);
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
  options?: NumberStepOptions,
): NumberStepResult {
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
): NumberStepError {
  const result: NumberStepError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `number-step patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): NumberStepError {
  const result: NumberStepError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `number-step patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: NumberStepErrorCode, reason: string, pointer?: Pointer): NumberStepError {
  const result: NumberStepError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
