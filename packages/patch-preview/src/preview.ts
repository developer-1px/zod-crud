import {
  applyPatch,
  applyPatchToTrustedState,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
} from "zod-crud";

import type {
  PatchPreviewOptions,
  PatchPreviewResult,
  PatchPreviewSchema,
} from "./types.js";

export function previewPatch<T>(
  schema: PatchPreviewSchema,
  doc: JSONDocument<T>,
  operations: ReadonlyArray<JSONPatchOperation>,
  options: PatchPreviewOptions = {},
): PatchPreviewResult<T> {
  const capability = doc.canPatch(operations);
  if (!capability.ok) {
    return {
      ok: false,
      code: "patch_rejected",
      reason: capability.reason ?? "patch rejected by document capability check",
      capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
      ...(capability.pointer !== undefined ? { pointer: capability.pointer } : {}),
    };
  }

  const applied = options.trustedState === true
    ? applyPatchToTrustedState(schema, doc.value, operations)
    : applyPatch(schema, doc.value, operations);
  if (!applied.result.ok) {
    return {
      ok: false,
      code: "preview_failed",
      reason: applied.result.reason ?? "patch preview failed",
      result: cloneJson(applied.result) as Extract<JSONResult, { ok: false }>,
      ...(applied.result.pointer !== undefined ? { pointer: applied.result.pointer } : {}),
    };
  }

  return {
    ok: true,
    value: cloneJson(applied.state) as T,
    applied: applied.applied.map((operation) => cloneJson(operation) as JSONPatchOperation),
    changed: jsonSignature(doc.value) !== jsonSignature(applied.state),
  };
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonSignature(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? "undefined" : text;
}
