import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type PadErrorCode =
  | "invalid_pointer"
  | "invalid_options"
  | "path_not_found"
  | "not_a_string"
  | "patch_rejected"
  | "patch_failed";

export interface PadError {
  ok: false;
  code: PadErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface PadOptions {
  /** Fill string. Default `" "`. */
  fill?: string;
  /** Which side to pad. Default `"start"`. */
  side?: "start" | "end";
}

export interface PadChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type PadResult = PadChange | PadError;

export interface Pad<TDocument> {
  canPad(pointer: Pointer, length: number, options?: PadOptions): PadResult;
  pad(pointer: Pointer, length: number, options?: PadOptions): PadResult;
}

export function createPad<TDocument>(doc: JSONDocument<TDocument>): Pad<TDocument> {
  return {
    canPad(pointer, length, options) {
      return canPad(doc, pointer, length, options);
    },
    pad(pointer, length, options) {
      return pad(doc, pointer, length, options);
    },
  };
}

export function canPad<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  length: number,
  options?: PadOptions,
): PadResult {
  if (!Number.isInteger(length) || length < 0) {
    return error("invalid_options", `length must be a non-negative integer, got ${length}`, pointer);
  }
  const fill = options?.fill ?? " ";
  if (fill.length === 0) {
    return error("invalid_options", "fill must be a non-empty string", pointer);
  }

  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `pad path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "string") {
    return error("not_a_string", `field is not a string: ${pointer}`, pointer);
  }

  const next = options?.side === "end"
    ? current.padEnd(length, fill)
    : current.padStart(length, fill);

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

export function pad<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  length: number,
  options?: PadOptions,
): PadResult {
  const change = canPad(doc, pointer, length, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): PadError {
  const result: PadError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `pad patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): PadError {
  const result: PadError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `pad patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: PadErrorCode, reason: string, pointer?: Pointer): PadError {
  const result: PadError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
