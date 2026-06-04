import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

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

export function createToggleOption<TDocument>(doc: JSONDocument<TDocument>): ToggleOption<TDocument> {
  return {
    canToggle: (path, value, options) => plan(doc, path, value, "toggle", options),
    toggle: (path, value, options) => apply(doc, path, value, "toggle", options),
    add: (path, value, options) => apply(doc, path, value, "add", options),
    remove: (path, value, options) => apply(doc, path, value, "remove", options),
  };
}

type Mode = "toggle" | "add" | "remove";

export function plan<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  value: TValue,
  mode: Mode,
  options?: ToggleOptionOptions<TValue>,
): ToggleOptionResult {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `toggle-option path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `toggle-option path is not an array: ${path}`, path);
  }
  const items = read.value as TValue[];
  const keyOf = options?.keyOf;

  let targetKey: unknown;
  try {
    targetKey = keyOf ? keyOf(value) : value;
  } catch (cause) {
    return error("key_failed", cause instanceof Error ? cause.message : "toggle-option keyOf threw.", path);
  }
  const fingerprint = JSON.stringify(targetKey ?? null);

  let present = false;
  const keptForRemoval: TValue[] = [];
  for (const item of items) {
    let key: unknown;
    try {
      key = keyOf ? keyOf(item) : item;
    } catch (cause) {
      return error("key_failed", cause instanceof Error ? cause.message : "toggle-option keyOf threw.", path);
    }
    if (JSON.stringify(key ?? null) === fingerprint) {
      present = true;
    } else {
      keptForRemoval.push(item);
    }
  }

  const shouldAdd = mode === "add" || (mode === "toggle" && !present);
  const shouldRemove = mode === "remove" || (mode === "toggle" && present);

  let next: TValue[];
  let action: MembershipAction;
  if (shouldAdd && !present) {
    next = [...items, value];
    action = "added";
  } else if (shouldRemove && present) {
    next = keptForRemoval;
    action = "removed";
  } else {
    next = items;
    action = "none";
  }

  const changed = action !== "none";
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path, value: cloneJson(next) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(path, capability);
  }

  return {
    ok: true,
    path,
    present: action === "added" ? true : action === "removed" ? false : present,
    action,
    changed,
    operations,
  };
}

function apply<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  value: TValue,
  mode: Mode,
  options?: ToggleOptionOptions<TValue>,
): ToggleOptionResult {
  const change = plan(doc, path, value, mode, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ToggleOptionError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `toggle-option patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ToggleOptionError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `toggle-option patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: ToggleOptionErrorCode, reason: string, pointer?: Pointer): ToggleOptionError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
