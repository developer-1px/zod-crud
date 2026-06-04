import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type RoundErrorCode =
  | "invalid_pointer"
  | "invalid_options"
  | "path_not_found"
  | "not_a_number"
  | "patch_rejected"
  | "patch_failed";

export interface RoundError {
  ok: false;
  code: RoundErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type RoundMode = "round" | "floor" | "ceil" | "trunc";

export interface RoundOptions {
  /** Rounding mode. Default `"round"`. */
  mode?: RoundMode;
  /** Decimal places to round to. Default `0`. Ignored when `step` is set. */
  precision?: number;
  /** Round to the nearest multiple of this step (e.g. `0.25`). Overrides `precision`. */
  step?: number;
}

export interface RoundChange {
  ok: true;
  pointer: Pointer;
  from: number;
  to: number;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type RoundResult = RoundChange | RoundError;

export interface Round<TDocument> {
  canRound(pointer: Pointer, options?: RoundOptions): RoundResult;
  round(pointer: Pointer, options?: RoundOptions): RoundResult;
}

export function createRound<TDocument>(doc: JSONDocument<TDocument>): Round<TDocument> {
  return {
    canRound: (pointer, options) => canRound(doc, pointer, options),
    round: (pointer, options) => round(doc, pointer, options),
  };
}

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
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function round<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: RoundOptions,
): RoundResult {
  const change = canRound(doc, pointer, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
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

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): RoundError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `round patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): RoundError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `round patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: RoundErrorCode, reason: string, pointer?: Pointer): RoundError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
