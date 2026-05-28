import {
  type JSONCapabilityResult,
  type JSONDocument,
  type Pointer,
  type SchemaDescription,
  type SchemaKind,
  type SchemaPathMode,
} from "zod-crud";

export type ValueFactoryErrorCode =
  | "schema_path_failed"
  | "factory_miss"
  | "factory_failed"
  | "value_rejected"
  | "insert_rejected"
  | "insert_failed";

export interface ValueFactoryContext {
  path: Pointer;
  mode: SchemaPathMode;
  kind: SchemaKind;
  description: SchemaDescription;
}

export type ValueFactoryCreate<TValue = unknown> = (
  context: ValueFactoryContext,
) => TValue | undefined;

export interface ValueFactoryOptions {
  mode?: SchemaPathMode;
}

export interface ValueFactoryError {
  ok: false;
  code: ValueFactoryErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  failure?: unknown;
}

export interface ValueFactoryChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  mode: SchemaPathMode;
  kind: SchemaKind;
  value: TValue;
}

export type ValueFactoryCreateResult<TValue = unknown> =
  | ValueFactoryChange<TValue>
  | ValueFactoryError;

export type ValueFactoryInsertResult<TValue = unknown> =
  | ValueFactoryChange<TValue>
  | ValueFactoryError;

export interface ValueFactory<TDocument, TValue = unknown> {
  canCreate(path: Pointer, options?: ValueFactoryOptions): ValueFactoryCreateResult<TValue>;
  create(path: Pointer, options?: ValueFactoryOptions): ValueFactoryCreateResult<TValue>;
  canInsert(path: Pointer, options?: ValueFactoryOptions): ValueFactoryInsertResult<TValue>;
  insert(path: Pointer, options?: ValueFactoryOptions): ValueFactoryInsertResult<TValue>;
}

export function createValueFactory<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  create: ValueFactoryCreate<TValue>,
): ValueFactory<TDocument, TValue> {
  return {
    canCreate(path, options) {
      return canCreateValue(doc, path, create, options);
    },
    create(path, options) {
      return createValue(doc, path, create, options);
    },
    canInsert(path, options) {
      return canInsertValue(doc, path, create, options);
    },
    insert(path, options) {
      return insertValue(doc, path, create, options);
    },
  };
}

export function canCreateValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  create: ValueFactoryCreate<TValue>,
  options: ValueFactoryOptions = {},
): ValueFactoryCreateResult<TValue> {
  const mode = options.mode ?? "insert";
  const schema = doc.schema.describe(path, mode);
  if (!schema.ok) {
    return valueFactoryError(
      "schema_path_failed",
      schema.reason ?? `schema path not found: ${path}`,
      schema.pointer,
    );
  }

  let value: TValue | undefined;
  try {
    value = create({
      path,
      mode,
      kind: schema.description.kind,
      description: cloneJson(schema.description),
    });
  } catch (error) {
    return valueFactoryError(
      "factory_failed",
      error instanceof Error ? error.message : `value factory failed for ${path}`,
      path,
    );
  }

  if (value === undefined) {
    return valueFactoryError("factory_miss", `value factory returned no value for ${path}`, path);
  }

  const capability = doc.schema.accepts(path, value, mode);
  if (!capability.ok) return capabilityError("value_rejected", path, capability);

  return {
    ok: true,
    path,
    mode,
    kind: schema.description.kind,
    value: cloneJson(value),
  };
}

export function createValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  create: ValueFactoryCreate<TValue>,
  options: ValueFactoryOptions = {},
): ValueFactoryCreateResult<TValue> {
  return canCreateValue(doc, path, create, options);
}

export function canInsertValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  create: ValueFactoryCreate<TValue>,
  options: ValueFactoryOptions = {},
): ValueFactoryInsertResult<TValue> {
  const change = canCreateValue(doc, path, create, { ...options, mode: options.mode ?? "insert" });
  if (!change.ok) return change;

  const capability = doc.canInsert(path, change.value);
  if (!capability.ok) return capabilityError("insert_rejected", path, capability);

  return change;
}

export function insertValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  create: ValueFactoryCreate<TValue>,
  options: ValueFactoryOptions = {},
): ValueFactoryInsertResult<TValue> {
  const change = canInsertValue(doc, path, create, options);
  if (!change.ok) return change;

  const inserted = doc.insert(path, cloneJson(change.value));
  if (!inserted.ok) {
    return valueFactoryFailure(
      "insert_failed",
      inserted.reason ?? `insert failed for ${path}`,
      inserted.pointer ?? path,
      inserted,
    );
  }
  return change;
}

function capabilityError(
  code: "value_rejected" | "insert_rejected",
  path: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ValueFactoryError {
  const error: ValueFactoryError = {
    ok: false,
    code,
    reason: capability.reason ?? `${code} for ${path}`,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  else error.pointer = path;
  return error;
}

function valueFactoryFailure(
  code: "insert_failed",
  reason: string,
  pointer: Pointer,
  failure: unknown,
): ValueFactoryError {
  return {
    ok: false,
    code,
    reason,
    pointer,
    failure,
  };
}

function valueFactoryError(
  code: ValueFactoryErrorCode,
  reason: string,
  pointer?: Pointer,
): ValueFactoryError {
  const error: ValueFactoryError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
