import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONPatchOperation,
  JSONResult,
  Pointer,
  ReadResult,
} from "zod-crud";

export type ComputedFieldErrorCode =
  | "read_failed"
  | "compute_failed"
  | "value_rejected"
  | "patch_rejected"
  | "patch_failed";

export interface ComputedFieldError {
  ok: false;
  code: ComputedFieldErrorCode;
  reason: string;
  key?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Extract<JSONResult, { ok: false }>;
}

export interface ComputedFieldContext<TDocument> {
  key: string;
  path: Pointer;
  value: TDocument;
  doc: JSONDocument<TDocument>;
  at(path: Pointer): ReadResult;
}

export interface ComputedFieldDefinition<TDocument> {
  key?: string;
  path: Pointer;
  compute(context: ComputedFieldContext<TDocument>): unknown;
}

export interface ComputedFieldChange {
  key: string;
  path: Pointer;
  current: unknown;
  computed: unknown;
  changed: boolean;
  operation: JSONPatchOperation | null;
}

export interface ComputedFieldsChange {
  ok: true;
  changed: boolean;
  fields: ReadonlyArray<ComputedFieldChange>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ComputedFieldsPlanResult =
  | ComputedFieldsChange
  | ComputedFieldError;

export type ComputedFieldsSyncResult =
  | ComputedFieldsChange
  | ComputedFieldError;

export interface ComputedFields<TDocument> {
  current(): ComputedFieldsPlanResult;
  canSync(): ComputedFieldsPlanResult;
  sync(): ComputedFieldsSyncResult;
}

export function createComputedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<ComputedFieldDefinition<TDocument>>,
): ComputedFields<TDocument> {
  return {
    current() {
      return planComputedFields(doc, fields);
    },
    canSync() {
      return planComputedFields(doc, fields);
    },
    sync() {
      return syncComputedFields(doc, fields);
    },
  };
}

export function planComputedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<ComputedFieldDefinition<TDocument>>,
): ComputedFieldsPlanResult {
  const changes: ComputedFieldChange[] = [];
  const operations: JSONPatchOperation[] = [];

  for (const field of fields) {
    const key = field.key ?? field.path;
    const read = doc.at(field.path);
    if (!read.ok) {
      return {
        ok: false,
        code: "read_failed",
        reason: read.reason ?? `computed field target not found: ${field.path}`,
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
        reason: error instanceof Error ? error.message : `computed field failed: ${key}`,
        key,
        pointer: read.path,
      };
    }

    const accepted = doc.schema.accepts(read.path, computed);
    if (!accepted.ok) return capabilityError("value_rejected", key, read.path, accepted);

    const changed = !jsonEqual(read.value, computed);
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

export function syncComputedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<ComputedFieldDefinition<TDocument>>,
): ComputedFieldsSyncResult {
  const plan = planComputedFields(doc, fields);
  if (!plan.ok) return plan;
  if (plan.operations.length === 0) return plan;

  const patched = doc.patch(plan.operations);
  if (!patched.ok) {
    const error: ComputedFieldError = {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "computed field patch failed",
      result: patched,
    };
    if (patched.pointer !== undefined) error.pointer = patched.pointer;
    return error;
  }
  return plan;
}

function capabilityError(
  code: "value_rejected" | "patch_rejected",
  key: string,
  pointer: Pointer | undefined,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ComputedFieldError {
  const error: ComputedFieldError = {
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

function copyChange(change: ComputedFieldChange): ComputedFieldChange {
  return {
    key: change.key,
    path: change.path,
    current: cloneJson(change.current),
    computed: cloneJson(change.computed),
    changed: change.changed,
    operation: change.operation === null ? null : cloneJson(change.operation),
  };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
