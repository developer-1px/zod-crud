import type {
  JSONCapabilityResult,
  JSONPatchOperation,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

export type PatchPreviewSchema = Parameters<typeof import("@interactive-os/json-document").applyPatch>[0];

export type PatchPreviewErrorCode =
  | "patch_rejected"
  | "preview_failed";

export interface PatchPreviewError {
  ok: false;
  code: PatchPreviewErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Extract<JSONResult, { ok: false }>;
}

export interface PatchPreviewOptions {
  trustedState?: boolean;
}

export interface PatchPreviewOk<T> {
  ok: true;
  value: T;
  applied: ReadonlyArray<JSONPatchOperation>;
  changed: boolean;
}

export type PatchPreviewResult<T> = PatchPreviewOk<T> | PatchPreviewError;

export interface PatchPreview<T> {
  canPreview(operations: ReadonlyArray<JSONPatchOperation>): JSONCapabilityResult;
  preview(operations: ReadonlyArray<JSONPatchOperation>): PatchPreviewResult<T>;
}
