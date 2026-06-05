import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type JoinTextErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "source_not_array"
  | "map_failed"
  | "patch_rejected"
  | "patch_failed";

export interface JoinTextError {
  ok: false;
  code: JoinTextErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface JoinTextOptions {
  /** Separator between items. Default `", "`. */
  separator?: string;
  /** Map each item to a string. Default: strings pass through, others via JSON. */
  map?: (item: unknown, index: number) => string;
  /** Drop items that map to an empty string. Default `false`. */
  dropEmpty?: boolean;
}

export interface JoinTextChange {
  ok: true;
  source: Pointer;
  target: Pointer;
  value: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type JoinTextResult = JoinTextChange | JoinTextError;

export interface JoinText<TDocument> {
  canJoin(source: Pointer, target: Pointer, options?: JoinTextOptions): JoinTextResult;
  join(source: Pointer, target: Pointer, options?: JoinTextOptions): JoinTextResult;
}
