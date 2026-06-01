import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ForwardFillErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface ForwardFillError {
  ok: false;
  code: ForwardFillErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface ForwardFillOptions {
  /** Relative field carried per item, e.g. `"/value"`. Default `""` (whole item). */
  field?: Pointer;
  /** `"down"` carries the previous non-empty value forward (default); `"up"` carries the next one back. */
  direction?: "down" | "up";
  /** Decide whether a value counts as empty (gets filled). Default: null, undefined, or "". */
  isEmpty?: (value: unknown) => boolean;
}

export interface ForwardFillChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  /** Number of empty slots filled from a neighbor. */
  filled: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ForwardFillResult = ForwardFillChange | ForwardFillError;

export interface ForwardFill<TDocument> {
  canForwardFill(path: Pointer, options?: ForwardFillOptions): ForwardFillResult;
  forwardFill(path: Pointer, options?: ForwardFillOptions): ForwardFillResult;
}

export function createForwardFill<TDocument>(doc: JSONDocument<TDocument>): ForwardFill<TDocument> {
  return {
    canForwardFill(path, options) {
      return canForwardFill(doc, path, options);
    },
    forwardFill(path, options) {
      return forwardFill(doc, path, options);
    },
  };
}

export function canForwardFill<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: ForwardFillOptions,
): ForwardFillResult {
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }
  const isEmpty = options?.isEmpty ?? defaultIsEmpty;
  const up = options?.direction === "up";

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `forward-fill path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `forward-fill path is not an array: ${path}`, path);
  }
  const items = read.value as unknown[];

  const valueAt = (index: number): unknown => {
    const item = items[index];
    if (field === "") return item;
    if (item === null || typeof item !== "object") return undefined;
    // field starts with "/"; resolve a shallow single-segment path for the common case.
    const key = field.slice(1);
    return (item as Record<string, unknown>)[key];
  };

  const order = up ? range(items.length - 1, -1, -1) : range(0, items.length, 1);
  const operations: JSONPatchOperation[] = [];
  let filled = 0;
  let carry: { has: boolean; value: unknown } = { has: false, value: undefined };
  for (const index of order) {
    const current = valueAt(index);
    if (isEmpty(current)) {
      if (carry.has) {
        const writePointer = field === "" ? appendSegment(path, index) : appendSegment(path, index) + field;
        operations.push({ op: "replace", path: writePointer, value: cloneJson(carry.value) });
        filled += 1;
      }
    } else {
      carry = { has: true, value: current };
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(path, capability);
  }

  return { ok: true, path, field, filled, changed: operations.length > 0, operations };
}

export function forwardFill<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: ForwardFillOptions,
): ForwardFillResult {
  const change = canForwardFill(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function defaultIsEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ForwardFillError {
  const result: ForwardFillError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `forward-fill patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ForwardFillError {
  const result: ForwardFillError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `forward-fill patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: ForwardFillErrorCode, reason: string, pointer?: Pointer): ForwardFillError {
  const result: ForwardFillError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as TValue);
}
