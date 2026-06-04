import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ChangeCaseErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_string"
  | "transform_failed"
  | "patch_rejected"
  | "patch_failed";

export interface ChangeCaseError {
  ok: false;
  code: ChangeCaseErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A named case/whitespace transform, or a host function over the current string. */
export type CaseTransform =
  | "upper"
  | "lower"
  | "trim"
  | "capitalize"
  | "title"
  | ((value: string) => string);

export interface ChangeCaseChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ChangeCaseResult = ChangeCaseChange | ChangeCaseError;

export interface ChangeCase<TDocument> {
  canTransform(pointer: Pointer, transform: CaseTransform): ChangeCaseResult;
  transform(pointer: Pointer, transform: CaseTransform): ChangeCaseResult;
}

export function createChangeCase<TDocument>(doc: JSONDocument<TDocument>): ChangeCase<TDocument> {
  return {
    canTransform: (pointer, transform) => canTransform(doc, pointer, transform),
    transform: (pointer, transform) => applyTransform(doc, pointer, transform),
  };
}

export function canTransform<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  transform: CaseTransform,
): ChangeCaseResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `change-case path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "string") {
    return error("not_a_string", `field is not a string: ${pointer}`, pointer);
  }

  let next: string;
  try {
    next = runTransform(current, transform);
  } catch (cause) {
    return error("transform_failed", cause instanceof Error ? cause.message : "text transform threw.", pointer);
  }

  const changed = next !== current;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: next }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function applyTransform<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  transform: CaseTransform,
): ChangeCaseResult {
  const change = canTransform(doc, pointer, transform);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function runTransform(value: string, transform: CaseTransform): string {
  if (typeof transform === "function") return transform(value);
  switch (transform) {
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "trim":
      return value.trim();
    case "capitalize":
      return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
    case "title":
      return value.replace(/\S+/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  }
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ChangeCaseError {
  const result: ChangeCaseError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `change-case patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ChangeCaseError {
  const result: ChangeCaseError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `change-case patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: ChangeCaseErrorCode, reason: string, pointer?: Pointer): ChangeCaseError {
  const result: ChangeCaseError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
