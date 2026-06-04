import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type RenumberItemsErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface RenumberItemsError {
  ok: false;
  code: RenumberItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface RenumberItemsOptions {
  /** Relative field written on each item, e.g. `"/position"`. Default `"/order"`. */
  field?: Pointer;
  /** First index value. Default `0`. */
  start?: number;
  /** Increment between consecutive items. Default `1`. */
  step?: number;
}

export interface RenumberItemsChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  count: number;
  /** Number of items whose order field changed. */
  changedCount: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type RenumberItemsResult = RenumberItemsChange | RenumberItemsError;

export interface RenumberItems<TDocument> {
  canRenumberItems(path: Pointer, options?: RenumberItemsOptions): RenumberItemsResult;
  renumberItems(path: Pointer, options?: RenumberItemsOptions): RenumberItemsResult;
}

export function createRenumberItems<TDocument>(doc: JSONDocument<TDocument>): RenumberItems<TDocument> {
  return {
    canRenumberItems: (path, options) => canRenumberItems(doc, path, options),
    renumberItems: (path, options) => renumberItems(doc, path, options),
  };
}

export function canRenumberItems<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: RenumberItemsOptions,
): RenumberItemsResult {
  const field = options?.field ?? "/order";
  if (!field.startsWith("/")) {
    return error("invalid_field", `field must start with '/': ${field}`, field);
  }
  const start = options?.start ?? 0;
  const step = options?.step ?? 1;

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `renumber-items path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `renumber-items path is not an array: ${path}`, path);
  }
  const items = read.value as unknown[];

  const operations: JSONPatchOperation[] = [];
  let changedCount = 0;
  for (let index = 0; index < items.length; index += 1) {
    const writePointer = appendSegment(path, index) + field;
    const next = start + index * step;
    const current = doc.at(writePointer);
    if (!current.ok || current.value !== next) {
      operations.push({ op: "replace", path: writePointer, value: next });
      changedCount += 1;
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(path, capability);
  }

  return {
    ok: true,
    path,
    field,
    count: items.length,
    changedCount,
    changed: operations.length > 0,
    operations,
  };
}

export function renumberItems<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: RenumberItemsOptions,
): RenumberItemsResult {
  const change = canRenumberItems(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): RenumberItemsError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `renumber-items patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): RenumberItemsError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `renumber-items patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: RenumberItemsErrorCode, reason: string, pointer?: Pointer): RenumberItemsError {
  const result: RenumberItemsError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
