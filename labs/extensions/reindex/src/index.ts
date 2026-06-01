import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ReindexErrorCode =
  | "invalid_pointer"
  | "invalid_field"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface ReindexError {
  ok: false;
  code: ReindexErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface ReindexOptions {
  /** Relative field written on each item, e.g. `"/position"`. Default `"/order"`. */
  field?: Pointer;
  /** First index value. Default `0`. */
  start?: number;
  /** Increment between consecutive items. Default `1`. */
  step?: number;
}

export interface ReindexChange {
  ok: true;
  path: Pointer;
  field: Pointer;
  count: number;
  /** Number of items whose order field changed. */
  changedCount: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ReindexResult = ReindexChange | ReindexError;

export interface Reindex<TDocument> {
  canReindex(path: Pointer, options?: ReindexOptions): ReindexResult;
  reindex(path: Pointer, options?: ReindexOptions): ReindexResult;
}

export function createReindex<TDocument>(doc: JSONDocument<TDocument>): Reindex<TDocument> {
  return {
    canReindex(path, options) {
      return canReindex(doc, path, options);
    },
    reindex(path, options) {
      return reindex(doc, path, options);
    },
  };
}

export function canReindex<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: ReindexOptions,
): ReindexResult {
  const field = options?.field ?? "/order";
  if (!field.startsWith("/")) {
    return error("invalid_field", `field must start with '/': ${field}`, field);
  }
  const start = options?.start ?? 0;
  const step = options?.step ?? 1;

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `reindex path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `reindex path is not an array: ${path}`, path);
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

export function reindex<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: ReindexOptions,
): ReindexResult {
  const change = canReindex(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ReindexError {
  const result: ReindexError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `reindex patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ReindexError {
  const result: ReindexError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `reindex patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: ReindexErrorCode, reason: string, pointer?: Pointer): ReindexError {
  const result: ReindexError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
