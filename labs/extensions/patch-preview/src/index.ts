import {
  applyPatch,
  applyPatchToTrustedState,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

type PatchPreviewSchema = Parameters<typeof applyPatch>[0];

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

export function createPatchPreview<T>(
  schema: PatchPreviewSchema,
  doc: JSONDocument<T>,
  options: PatchPreviewOptions = {},
): PatchPreview<T> {
  return {
    canPreview(operations) {
      return doc.canPatch(operations);
    },
    preview(operations) {
      return previewPatch(schema, doc, operations, options);
    },
  };
}

export function previewPatch<T>(
  schema: PatchPreviewSchema,
  doc: JSONDocument<T>,
  operations: ReadonlyArray<JSONPatchOperation>,
  options: PatchPreviewOptions = {},
): PatchPreviewResult<T> {
  const capability = doc.canPatch(operations);
  if (!capability.ok) return rejectedPreview(capability);

  const applied = options.trustedState === true
    ? applyPatchToTrustedState(schema, doc.value, operations)
    : applyPatch(schema, doc.value, operations);
  if (!applied.result.ok) return failedPreview(applied.result);

  return {
    ok: true,
    value: cloneJson(applied.state) as T,
    applied: copyPatch(applied.applied),
    changed: jsonSignature(doc.value) !== jsonSignature(applied.state),
  };
}

function rejectedPreview(
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): PatchPreviewError {
  const error: PatchPreviewError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "patch rejected by document capability check",
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function failedPreview(
  result: Extract<JSONResult, { ok: false }>,
): PatchPreviewError {
  const error: PatchPreviewError = {
    ok: false,
    code: "preview_failed",
    reason: result.reason ?? "patch preview failed",
    result: cloneJson(result) as Extract<JSONResult, { ok: false }>,
  };
  if (result.pointer !== undefined) error.pointer = result.pointer;
  return error;
}

function copyPatch(
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<JSONPatchOperation> {
  return operations.map((operation) => cloneJson(operation) as JSONPatchOperation);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonSignature(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? "undefined" : text;
}
