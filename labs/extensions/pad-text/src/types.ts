import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

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
