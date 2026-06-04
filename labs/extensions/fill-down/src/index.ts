import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type FillDownErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface FillDownError {
  ok: false;
  code: FillDownErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface FillDownOptions {
  /** Relative field carried per item, e.g. `"/value"`. Default `""` (whole item). */
  field?: Pointer;
  /** `"down"` carries the previous non-empty value forward (default); `"up"` carries the next one back. */
  direction?: "down" | "up";
  /** Decide whether a value counts as empty (gets filled). Default: null, undefined, or "". */
  isEmpty?: (value: unknown) => boolean;
}

export interface FillDownChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  /** Number of empty slots filled from a neighbor. */
  filled: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type FillDownResult = FillDownChange | FillDownError;

export interface FillDown<TDocument> {
  canFillDown(path: Pointer, options?: FillDownOptions): FillDownResult;
  fillDown(path: Pointer, options?: FillDownOptions): FillDownResult;
}

export function createFillDown<TDocument>(doc: JSONDocument<TDocument>): FillDown<TDocument> {
  return {
    canFillDown: (path, options) => canFillDown(doc, path, options),
    fillDown: (path, options) => fillDown(doc, path, options),
  };
}

export function canFillDown<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: FillDownOptions,
): FillDownResult {
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }
  const isEmpty =
    options?.isEmpty ?? ((value: unknown) => value === null || value === undefined || value === "");
  const up = options?.direction === "up";

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `fill-down path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `fill-down path is not an array: ${path}`, path);
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

export function fillDown<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: FillDownOptions,
): FillDownResult {
  const change = canFillDown(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): FillDownError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `fill-down patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): FillDownError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `fill-down patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: FillDownErrorCode, reason: string, pointer?: Pointer): FillDownError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as TValue);
}
