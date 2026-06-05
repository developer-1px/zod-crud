import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { PadTextError, PadTextErrorCode, PadTextOptions, PadTextResult } from "./types.js";

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

function error(code: PadTextErrorCode, reason: string, pointer?: Pointer): PadTextError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
