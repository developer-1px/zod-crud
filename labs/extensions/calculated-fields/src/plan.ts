import type { JSONCapabilityResult, JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { CalculatedFieldChange, CalculatedFieldDefinition, CalculatedFieldError, CalculatedFieldsPlanResult } from "./types.js";

export function planCalculatedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<CalculatedFieldDefinition<TDocument>>,
): CalculatedFieldsPlanResult {
  const changes: CalculatedFieldChange[] = [];
  const operations: JSONPatchOperation[] = [];

  for (const field of fields) {
    const key = field.key ?? field.path;
    const read = doc.at(field.path);
    if (!read.ok) {
      return {
        ok: false,
        code: "read_failed",
        reason: read.reason ?? `calculated field target not found: ${field.path}`,
        key,
        pointer: read.pointer,
      };
    }

    let computed: unknown;
    try {
      computed = field.compute({
        key,
        path: read.path,
        value: cloneJson(doc.value),
        doc,
        at(path) {
          return doc.at(path);
        },
      });
    } catch (error) {
      return {
        ok: false,
        code: "compute_failed",
        reason: error instanceof Error ? error.message : `calculated field failed: ${key}`,
        key,
        pointer: read.path,
      };
    }

    const accepted = doc.schema.accepts(read.path, computed);
    if (!accepted.ok) return capabilityError("value_rejected", key, read.path, accepted);

    const changed = JSON.stringify(read.value) !== JSON.stringify(computed);
    const operation: JSONPatchOperation | null = changed
      ? { op: "replace", path: read.path, value: cloneJson(computed) }
      : null;
    if (operation !== null) operations.push(operation);
    changes.push({
      key,
      path: read.path,
      current: cloneJson(read.value),
      computed: cloneJson(computed),
      changed,
      operation: operation === null ? null : cloneJson(operation),
    });
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError("patch_rejected", "batch", capability.pointer, capability);
  }

  return {
    ok: true,
    changed: operations.length > 0,
    fields: changes.map(copyChange),
    operations: cloneJson(operations),
  };
}

function capabilityError(
  code: "value_rejected" | "patch_rejected",
  key: string,
  pointer: Pointer | undefined,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): CalculatedFieldError {
  const error: CalculatedFieldError = {
    ok: false,
    code,
    reason: capability.reason ?? `${code}: ${key}`,
    key,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  else if (pointer !== undefined) error.pointer = pointer;
  return error;
}

function copyChange(change: CalculatedFieldChange): CalculatedFieldChange {
  return {
    key: change.key,
    path: change.path,
    current: cloneJson(change.current),
    computed: cloneJson(change.computed),
    changed: change.changed,
    operation: change.operation === null ? null : cloneJson(change.operation),
  };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
