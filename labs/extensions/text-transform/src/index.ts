import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type TextTransformErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_a_string"
  | "transform_failed"
  | "patch_rejected"
  | "patch_failed";

export interface TextTransformError {
  ok: false;
  code: TextTransformErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** A named transform, or a host function over the current string. */
export type TextTransform =
  | "upper"
  | "lower"
  | "trim"
  | "capitalize"
  | "title"
  | ((value: string) => string);

export interface TextTransformChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type TextTransformResult = TextTransformChange | TextTransformError;

export interface TextTransformer<TDocument> {
  canTransform(pointer: Pointer, transform: TextTransform): TextTransformResult;
  transform(pointer: Pointer, transform: TextTransform): TextTransformResult;
}

export function createTextTransform<TDocument>(doc: JSONDocument<TDocument>): TextTransformer<TDocument> {
  return {
    canTransform(pointer, transform) {
      return canTransform(doc, pointer, transform);
    },
    transform(pointer, transform) {
      return applyTransform(doc, pointer, transform);
    },
  };
}

export function canTransform<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  transform: TextTransform,
): TextTransformResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `text-transform path not found: ${pointer}`, read.pointer);
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
  transform: TextTransform,
): TextTransformResult {
  const change = canTransform(doc, pointer, transform);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function runTransform(value: string, transform: TextTransform): string {
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
): TextTransformError {
  const result: TextTransformError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `text-transform patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): TextTransformError {
  const result: TextTransformError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `text-transform patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: TextTransformErrorCode, reason: string, pointer?: Pointer): TextTransformError {
  const result: TextTransformError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
