import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type ToggleValueErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_toggleable"
  | "patch_rejected"
  | "patch_failed";

export interface ToggleValueError {
  ok: false;
  code: ToggleValueErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type ToggleValueDirection = "next" | "prev";

export interface ToggleValueOptions<TValue = unknown> {
  /** Ordered values to advance through. Omit for boolean fields (toggles). */
  values?: ReadonlyArray<TValue>;
  /** Direction through the value list. Default `"next"`. */
  direction?: ToggleValueDirection;
}

export interface ToggleValueChange<TValue = unknown> {
  ok: true;
  pointer: Pointer;
  from: TValue;
  to: TValue;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ToggleValueResult<TValue = unknown> = ToggleValueChange<TValue> | ToggleValueError;

export interface ToggleValue<TDocument> {
  canToggleValue<TValue = unknown>(pointer: Pointer, options?: ToggleValueOptions<TValue>): ToggleValueResult<TValue>;
  toggleValue<TValue = unknown>(pointer: Pointer, options?: ToggleValueOptions<TValue>): ToggleValueResult<TValue>;
}
