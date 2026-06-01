import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type FillEmptyErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface FillEmptyError {
  ok: false;
  code: FillEmptyErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the fill value per target. */
export type FillEmptyValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (pointer: Pointer, index: number) => TValue };

export interface FillEmptyOptions {
  /** Relative sub-pointer written inside each target, e.g. `"/status"`. Default `""`. */
  field?: Pointer;
  /** Decide whether the current value counts as empty. Default: null, "", or []. */
  isEmpty?: (current: unknown) => boolean;
}

export interface FillEmptyChange {
  ok: true;
  /** Write pointers considered, in input order. */
  pointers: ReadonlyArray<Pointer>;
  count: number;
  /** Number of empty slots filled. */
  filled: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type FillEmptyResult = FillEmptyChange | FillEmptyError;

export interface FillEmpty<TDocument> {
  canFillEmpty<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillEmptyValue<TValue>, options?: FillEmptyOptions): FillEmptyResult;
  fillEmpty<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillEmptyValue<TValue>, options?: FillEmptyOptions): FillEmptyResult;
}

export function createFillEmpty<TDocument>(doc: JSONDocument<TDocument>): FillEmpty<TDocument> {
  return {
    canFillEmpty(targets, value, options) {
      return canFillEmpty(doc, targets, value, options);
    },
    fillEmpty(targets, value, options) {
      return fillEmpty(doc, targets, value, options);
    },
  };
}

export function canFillEmpty<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillEmptyValue<TValue>,
  options?: FillEmptyOptions,
): FillEmptyResult {
  if (targets.length === 0) {
    return error("empty_targets", "fill-empty requires at least one target pointer.");
  }
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }
  const isEmpty = options?.isEmpty ?? defaultIsEmpty;

  const pointers: Pointer[] = [];
  const operations: JSONPatchOperation[] = [];
  let filled = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index] as Pointer;
    const writePointer = field === "" ? target : target + field;
    pointers.push(writePointer);

    const read = doc.at(writePointer);
    if (!read.ok) {
      return error(read.code, read.reason ?? `fill-empty target not found: ${writePointer}`, read.pointer);
    }
    if (!isEmpty(read.value)) continue;

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "fill-empty compute threw.", writePointer);
    }

    if (JSON.stringify(read.value) !== JSON.stringify(next)) {
      operations.push({ op: "replace", path: writePointer, value: cloneJson(next) });
      filled += 1;
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
    filled,
    changed: operations.length > 0,
    operations,
    selectionAfter: [...targets],
  };
}

export function fillEmpty<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillEmptyValue<TValue>,
  options?: FillEmptyOptions,
): FillEmptyResult {
  const change = canFillEmpty(doc, targets, value, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(patched);
  return change;
}

function defaultIsEmpty(current: unknown): boolean {
  return (
    current === null ||
    current === undefined ||
    current === "" ||
    (Array.isArray(current) && current.length === 0)
  );
}

function capabilityError(capability: Exclude<JSONCapabilityResult, { ok: true }>): FillEmptyError {
  const result: FillEmptyError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "fill-empty patch rejected",
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(patch: Extract<JSONResult, { ok: false }>): FillEmptyError {
  const result: FillEmptyError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "fill-empty patch failed",
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: FillEmptyErrorCode, reason: string, pointer?: Pointer): FillEmptyError {
  const result: FillEmptyError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
