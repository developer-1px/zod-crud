import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { RoundError, RoundErrorCode, RoundMode, RoundOptions, RoundResult } from "./types.js";

export function canRound<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: RoundOptions,
): RoundResult {
  const mode = options?.mode ?? "round";
  const step = options?.step;
  const precision = options?.precision ?? 0;
  if (step !== undefined && (!(step > 0) || !Number.isFinite(step))) {
    return error("invalid_options", `step must be a positive finite number, got ${step}`, pointer);
  }
  if (step === undefined && !Number.isInteger(precision)) {
    return error("invalid_options", `precision must be an integer, got ${precision}`, pointer);
  }

  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `round path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "number" || !Number.isFinite(current)) {
    return error("not_a_number", `field is not a finite number: ${pointer}`, pointer);
  }

  const next = step !== undefined
    ? apply(current / step, mode) * step
    : roundToPrecision(current, precision, mode);

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
        reason: capability.reason ?? `round patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

function apply(value: number, mode: RoundMode): number {
  switch (mode) {
    case "round":
      return Math.round(value);
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "trunc":
      return Math.trunc(value);
  }
}

function roundToPrecision(value: number, precision: number, mode: RoundMode): number {
  const factor = 10 ** precision;
  // scale, apply, unscale; round-trip through a string to avoid float drift.
  const scaled = apply(Number((value * factor).toFixed(8)), mode);
  return Number((scaled / factor).toFixed(Math.max(0, precision)));
}

function error(code: RoundErrorCode, reason: string, pointer?: Pointer): RoundError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
