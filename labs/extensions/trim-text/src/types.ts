import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type TrimTextErrorCode =
  | "invalid_pointer"
  | "invalid_max"
  | "path_not_found"
  | "not_a_string"
  | "patch_rejected"
  | "patch_failed";

export interface TrimTextError {
  ok: false;
  code: TrimTextErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface TrimTextOptions {
  /** Suffix appended when trimmed, counted within maxLength. Default `""`. */
  ellipsis?: string;
  /** Trim at the last whitespace boundary within the limit. Default `false`. */
  wordBoundary?: boolean;
}

export interface TrimTextChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type TrimTextResult = TrimTextChange | TrimTextError;

export interface TrimText<TDocument> {
  canTrimText(pointer: Pointer, maxLength: number, options?: TrimTextOptions): TrimTextResult;
  trimText(pointer: Pointer, maxLength: number, options?: TrimTextOptions): TrimTextResult;
}
