import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

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
