import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type BatchSetErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface BatchSetError {
  ok: false;
  code: BatchSetErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the value per target. */
export type BatchSetValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (current: unknown, pointer: Pointer, index: number) => TValue };

export interface BatchSetOptions {
  /** Relative sub-pointer written inside each target item, e.g. `"/status"`. Default `""` replaces the whole item. */
  field?: Pointer;
}

export interface BatchSetChange {
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

export type BatchSetResult = BatchSetChange | BatchSetError;

export interface BatchSet<TDocument> {
  canBatchSet<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchSetValue<TValue>, options?: BatchSetOptions): BatchSetResult;
  batchSet<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: BatchSetValue<TValue>, options?: BatchSetOptions): BatchSetResult;
}

export function createBatchSet<TDocument>(doc: JSONDocument<TDocument>): BatchSet<TDocument> {
  return {
    canBatchSet(targets, value, options) {
      return canBatchSet(doc, targets, value, options);
    },
    batchSet(targets, value, options) {
      return batchSet(doc, targets, value, options);
    },
  };
}

export function canBatchSet<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchSetValue<TValue>,
  options?: BatchSetOptions,
): BatchSetResult {
  if (targets.length === 0) {
    return error("empty_targets", "batch-set requires at least one target pointer.");
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
      return error(read.code, read.reason ?? `batch-set target not found: ${writePointer}`, read.pointer);
    }

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(read.value, writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "batch-set compute threw.", writePointer);
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

export function batchSet<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchSetValue<TValue>,
  options?: BatchSetOptions,
): BatchSetResult {
  const change = canBatchSet(doc, targets, value, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(patched);
  return change;
}

function capabilityError(capability: Exclude<JSONCapabilityResult, { ok: true }>): BatchSetError {
  const result: BatchSetError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "batch-set patch rejected",
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(patch: Extract<JSONResult, { ok: false }>): BatchSetError {
  const result: BatchSetError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "batch-set patch failed",
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: BatchSetErrorCode, reason: string, pointer?: Pointer): BatchSetError {
  const result: BatchSetError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
