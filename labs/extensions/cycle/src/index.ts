import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type CycleErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_cyclable"
  | "patch_rejected"
  | "patch_failed";

export interface CycleError {
  ok: false;
  code: CycleErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type CycleDirection = "next" | "prev";

export interface CycleOptions<TValue = unknown> {
  /** Ordered values to cycle through. Omit for boolean fields (toggles). */
  values?: ReadonlyArray<TValue>;
  /** Cycle direction. Default `"next"`. */
  direction?: CycleDirection;
}

export interface CycleChange<TValue = unknown> {
  ok: true;
  pointer: Pointer;
  from: TValue;
  to: TValue;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type CycleResult<TValue = unknown> = CycleChange<TValue> | CycleError;

export interface Cycle<TDocument> {
  canCycle<TValue = unknown>(pointer: Pointer, options?: CycleOptions<TValue>): CycleResult<TValue>;
  cycle<TValue = unknown>(pointer: Pointer, options?: CycleOptions<TValue>): CycleResult<TValue>;
}

export function createCycle<TDocument>(doc: JSONDocument<TDocument>): Cycle<TDocument> {
  return {
    canCycle(pointer, options) {
      return canCycle(doc, pointer, options);
    },
    cycle(pointer, options) {
      return cycle(doc, pointer, options);
    },
  };
}

export function canCycle<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: CycleOptions<TValue>,
): CycleResult<TValue> {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `cycle path not found: ${pointer}`, read.pointer);
  }

  const current = read.value as TValue;
  const step = options?.direction === "prev" ? -1 : 1;
  const next = nextValue(current, options?.values, step);
  if (!next.ok) {
    return error("not_cyclable", next.reason, pointer);
  }

  const changed = JSON.stringify(current) !== JSON.stringify(next.value);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: cloneJson(next.value) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return {
    ok: true,
    pointer,
    from: current,
    to: next.value as TValue,
    changed,
    operations,
  };
}

export function cycle<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: CycleOptions<TValue>,
): CycleResult<TValue> {
  const change = canCycle(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function nextValue<TValue>(
  current: TValue,
  values: ReadonlyArray<TValue> | undefined,
  step: number,
): { ok: true; value: TValue } | { ok: false; reason: string } {
  if (values && values.length > 0) {
    const fingerprint = JSON.stringify(current ?? null);
    const at = values.findIndex((value) => JSON.stringify(value ?? null) === fingerprint);
    if (at === -1) {
      // Current value not in the cycle: jump to the first entry.
      return { ok: true, value: values[0] as TValue };
    }
    const length = values.length;
    const index = (((at + step) % length) + length) % length;
    return { ok: true, value: values[index] as TValue };
  }

  if (typeof current === "boolean") {
    return { ok: true, value: !current as unknown as TValue };
  }

  return {
    ok: false,
    reason: "field is not a boolean; pass options.values to cycle non-boolean fields.",
  };
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): CycleError {
  const result: CycleError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `cycle patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): CycleError {
  const result: CycleError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `cycle patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: CycleErrorCode, reason: string, pointer?: Pointer): CycleError {
  const result: CycleError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
