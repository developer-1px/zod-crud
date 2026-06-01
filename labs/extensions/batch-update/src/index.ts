import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type BatchUpdateErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface BatchUpdateError {
  ok: false;
  code: BatchUpdateErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the value per target. */
export type BatchUpdateValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (current: unknown, pointer: Pointer, index: number) => TValue };

export interface BatchUpdateOptions {
  /** Relative sub-pointer written inside each target item, e.g. `"/status"`. Default `""` replaces the whole item. */
  field?: Pointer;
}

export interface BatchUpdateChange {
  ok: true;
  /** Write pointers actually targeted (target + field), in input order. */
  pointers: ReadonlyArray<Pointer>;
  count: number;
  /** Number of writes that change a value. */
  changed: number;
  operations: ReadonlyArray<JSONPatchOperation>;
  /** Original target item pointers, for hosts that keep selection. */
  selectionAfter: ReadonlyArray<Pointer>;
}

export type BatchUpdateResult = BatchUpdateChange | BatchUpdateError;

export interface BatchUpdate<TDocument> {
  canBatchUpdate<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchUpdateValue<TValue>, options?: BatchUpdateOptions): BatchUpdateResult;
  batchUpdate<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchUpdateValue<TValue>, options?: BatchUpdateOptions): BatchUpdateResult;
}

export function createBatchUpdate<TDocument>(doc: JSONDocument<TDocument>): BatchUpdate<TDocument> {
  return {
    canBatchUpdate(targets, value, options) {
      return canBatchUpdate(doc, targets, value, options);
    },
    batchUpdate(targets, value, options) {
      return batchUpdate(doc, targets, value, options);
    },
  };
}

export function canBatchUpdate<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchUpdateValue<TValue>,
  options?: BatchUpdateOptions,
): BatchUpdateResult {
  if (targets.length === 0) {
    return error("empty_targets", "batch-update requires at least one target pointer.");
  }
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }

  const pointers: Pointer[] = [];
  const operations: JSONPatchOperation[] = [];
  let changed = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index] as Pointer;
    const writePointer = field === "" ? target : target + field;
    pointers.push(writePointer);

    const read = doc.at(writePointer);
    if (!read.ok) {
      return error(read.code, read.reason ?? `batch-update target not found: ${writePointer}`, read.pointer);
    }

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(read.value, writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "batch-update compute threw.", writePointer);
    }

    if (JSON.stringify(read.value) !== JSON.stringify(next)) {
      operations.push({ op: "replace", path: writePointer, value: cloneJson(next) });
      changed += 1;
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(capability);
  }

  return {
    ok: true,
    pointers,
    count: targets.length,
    changed,
    operations,
    selectionAfter: [...targets],
  };
}

export function batchUpdate<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchUpdateValue<TValue>,
  options?: BatchUpdateOptions,
): BatchUpdateResult {
  const change = canBatchUpdate(doc, targets, value, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(patched);
  return change;
}

function capabilityError(capability: Exclude<JSONCapabilityResult, { ok: true }>): BatchUpdateError {
  const result: BatchUpdateError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "batch-update patch rejected",
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(patch: Extract<JSONResult, { ok: false }>): BatchUpdateError {
  const result: BatchUpdateError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "batch-update patch failed",
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: BatchUpdateErrorCode, reason: string, pointer?: Pointer): BatchUpdateError {
  const result: BatchUpdateError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
