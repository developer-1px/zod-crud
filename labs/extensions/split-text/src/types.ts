import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type SplitTextErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface SplitTextError {
  ok: false;
  code: SplitTextErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SplitTextOptions {
  /** Delimiter to split on. Default `","`. */
  delimiter?: string | RegExp;
  /** Trim each part. Default `true`. */
  trim?: boolean;
  /** Drop empty parts (after trimming). Default `true`. */
  dropEmpty?: boolean;
  /** Drop duplicate parts, keeping first. Default `false`. */
  dedupe?: boolean;
  /** Append parts to the existing array instead of replacing it. Default `false`. */
  append?: boolean;
}

export interface SplitTextChange {
  ok: true;
  path: Pointer;
  /** The parsed parts written (in order). */
  parts: ReadonlyArray<string>;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SplitTextResult = SplitTextChange | SplitTextError;

export interface SplitText<TDocument> {
  canSplit(path: Pointer, text: string, options?: SplitTextOptions): SplitTextResult;
  split(path: Pointer, text: string, options?: SplitTextOptions): SplitTextResult;
}
