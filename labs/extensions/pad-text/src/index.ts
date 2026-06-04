import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type PadTextErrorCode =
  | "invalid_pointer"
  | "invalid_options"
  | "path_not_found"
  | "not_a_string"
  | "patch_rejected"
  | "patch_failed";

export interface PadTextError {
  ok: false;
  code: PadTextErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface PadTextOptions {
  /** Fill string. Default `" "`. */
  fill?: string;
  /** Which side to pad. Default `"start"`. */
  side?: "start" | "end";
}

export interface PadTextChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type PadTextResult = PadTextChange | PadTextError;

export interface PadText<TDocument> {
  canPadText(pointer: Pointer, length: number, options?: PadTextOptions): PadTextResult;
  padText(pointer: Pointer, length: number, options?: PadTextOptions): PadTextResult;
}

export function createPadText<TDocument>(doc: JSONDocument<TDocument>): PadText<TDocument> {
  return {
    canPadText: (pointer, length, options) => canPadText(doc, pointer, length, options),
    padText: (pointer, length, options) => padText(doc, pointer, length, options),
  };
}

export function canPadText<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  length: number,
  options?: PadTextOptions,
): PadTextResult {
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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `pad patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function padText<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  length: number,
  options?: PadTextOptions,
): PadTextResult {
  const change = canPadText(doc, pointer, length, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `pad patch failed at ${pointer}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}

function error(code: PadTextErrorCode, reason: string, pointer?: Pointer): PadTextError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
