import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ToggleValueErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_toggleable"
  | "patch_rejected"
  | "patch_failed";

export interface ToggleValueError {
  ok: false;
  code: ToggleValueErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type ToggleValueDirection = "next" | "prev";

export interface ToggleValueOptions<TValue = unknown> {
  /** Ordered values to advance through. Omit for boolean fields (toggles). */
  values?: ReadonlyArray<TValue>;
  /** Direction through the value list. Default `"next"`. */
  direction?: ToggleValueDirection;
}

export interface ToggleValueChange<TValue = unknown> {
  ok: true;
  pointer: Pointer;
  from: TValue;
  to: TValue;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ToggleValueResult<TValue = unknown> = ToggleValueChange<TValue> | ToggleValueError;

export interface ToggleValue<TDocument> {
  canToggleValue<TValue = unknown>(pointer: Pointer, options?: ToggleValueOptions<TValue>): ToggleValueResult<TValue>;
  toggleValue<TValue = unknown>(pointer: Pointer, options?: ToggleValueOptions<TValue>): ToggleValueResult<TValue>;
}

export function createToggleValue<TDocument>(doc: JSONDocument<TDocument>): ToggleValue<TDocument> {
  return {
    canToggleValue: (pointer, options) => canToggleValue(doc, pointer, options),
    toggleValue: (pointer, options) => toggleValue(doc, pointer, options),
  };
}

export function canToggleValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: ToggleValueOptions<TValue>,
): ToggleValueResult<TValue> {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `toggle-value path not found: ${pointer}`, read.pointer);
  }

  const current = read.value as TValue;
  const step = options?.direction === "prev" ? -1 : 1;
  // When the host omits values, derive them from the schema: enum/literal now
  // expose their option set via describe().allowed (zod-crud #130). Booleans
  // still toggle without any value list.
  const values = options?.values ?? enumValuesFromSchema<TValue>(doc, pointer);
  const next = nextValue(current, values, step);
  if (!next.ok) {
    return error("not_toggleable", next.reason, pointer);
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

export function toggleValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: ToggleValueOptions<TValue>,
): ToggleValueResult<TValue> {
  const change = canToggleValue(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function enumValuesFromSchema<TValue>(
  doc: JSONDocument<unknown>,
  pointer: Pointer,
): ReadonlyArray<TValue> | undefined {
  const described = doc.schema.describe(pointer);
  if (!described.ok) return undefined;
  const allowed = described.description.allowed;
  return allowed && allowed.length > 0 ? (allowed as ReadonlyArray<TValue>) : undefined;
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
      // Current value not in the list: jump to the first entry.
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
    reason: "field is not a boolean; pass options.values to toggle non-boolean fields.",
  };
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ToggleValueError {
  const result: ToggleValueError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `toggle-value patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ToggleValueError {
  const result: ToggleValueError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `toggle-value patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: ToggleValueErrorCode, reason: string, pointer?: Pointer): ToggleValueError {
  const result: ToggleValueError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
