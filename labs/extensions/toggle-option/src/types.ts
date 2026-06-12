import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type ToggleOptionErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "key_failed"
  | "patch_rejected"
  | "patch_failed";

export interface ToggleOptionError {
  ok: false;
  code: ToggleOptionErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type MembershipAction = "added" | "removed" | "none";

export interface ToggleOptionOptions<TValue = unknown> {
  /** Equality key for membership. Default whole-value JSON. */
  keyOf?: (item: TValue) => unknown;
}

export interface ToggleOptionChange {
  ok: true;
  path: Pointer;
  /** Whether the value is present after the operation. */
  present: boolean;
  action: MembershipAction;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ToggleOptionResult = ToggleOptionChange | ToggleOptionError;

export interface ToggleOption<TDocument> {
  canToggle<TValue = unknown>(path: Pointer, value: TValue, options?: ToggleOptionOptions<TValue>): ToggleOptionResult;
  toggle<TValue = unknown>(path: Pointer, value: TValue, options?: ToggleOptionOptions<TValue>): ToggleOptionResult;
  add<TValue = unknown>(path: Pointer, value: TValue, options?: ToggleOptionOptions<TValue>): ToggleOptionResult;
  remove<TValue = unknown>(path: Pointer, value: TValue, options?: ToggleOptionOptions<TValue>): ToggleOptionResult;
}

export type Mode = "toggle" | "add" | "remove";
