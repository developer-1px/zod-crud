import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type FillBlanksErrorCode =
  | "empty_targets"
  | "invalid_field"
  | "invalid_pointer"
  | "path_not_found"
  | "value_failed"
  | "patch_rejected"
  | "patch_failed";

export interface FillBlanksError {
  ok: false;
  code: FillBlanksErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A constant value, or a host function computing the fill value per target. */
export type FillBlanksValue<TValue = unknown> =
  | { value: TValue }
  | { compute: (pointer: Pointer, index: number) => TValue };

export interface FillBlanksOptions {
  /** Relative sub-pointer written inside each target, e.g. `"/status"`. Default `""`. */
  field?: Pointer;
  /** Decide whether the current value counts as empty. Default: null, "", or []. */
  isEmpty?: (current: unknown) => boolean;
}

export interface FillBlanksChange {
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

export type FillBlanksResult = FillBlanksChange | FillBlanksError;

export interface FillBlanks<TDocument> {
  canFillBlanks<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillBlanksValue<TValue>, options?: FillBlanksOptions): FillBlanksResult;
  fillBlanks<TValue = unknown>(targets: ReadonlyArray<Pointer>, value: FillBlanksValue<TValue>, options?: FillBlanksOptions): FillBlanksResult;
}

export function createFillBlanks<TDocument>(doc: JSONDocument<TDocument>): FillBlanks<TDocument> {
  return {
    canFillBlanks: (targets, value, options) => canFillBlanks(doc, targets, value, options),
    fillBlanks: (targets, value, options) => fillBlanks(doc, targets, value, options),
  };
}

export function canFillBlanks<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillBlanksValue<TValue>,
  options?: FillBlanksOptions,
): FillBlanksResult {
  if (targets.length === 0) {
    return error("empty_targets", "fill-blanks requires at least one target pointer.");
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
      return error(read.code, read.reason ?? `fill-blanks target not found: ${writePointer}`, read.pointer);
    }
    if (!isEmpty(read.value)) continue;

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "fill-blanks compute threw.", writePointer);
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

export function fillBlanks<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillBlanksValue<TValue>,
  options?: FillBlanksOptions,
): FillBlanksResult {
  const change = canFillBlanks(doc, targets, value, options);
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

function capabilityError(capability: Exclude<JSONCapabilityResult, { ok: true }>): FillBlanksError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "fill-blanks patch rejected",
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(patch: Extract<JSONResult, { ok: false }>): FillBlanksError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "fill-blanks patch failed",
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: FillBlanksErrorCode, reason: string, pointer?: Pointer): FillBlanksError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
