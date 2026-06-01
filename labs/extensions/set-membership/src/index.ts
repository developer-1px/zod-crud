import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type SetMembershipErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "key_failed"
  | "patch_rejected"
  | "patch_failed";

export interface SetMembershipError {
  ok: false;
  code: SetMembershipErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type MembershipAction = "added" | "removed" | "none";

export interface SetMembershipOptions<TValue = unknown> {
  /** Equality key for membership. Default whole-value JSON. */
  keyOf?: (item: TValue) => unknown;
}

export interface SetMembershipChange {
  ok: true;
  path: Pointer;
  /** Whether the value is present after the operation. */
  present: boolean;
  action: MembershipAction;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SetMembershipResult = SetMembershipChange | SetMembershipError;

export interface SetMembership<TDocument> {
  canToggle<TValue = unknown>(path: Pointer, value: TValue, options?: SetMembershipOptions<TValue>): SetMembershipResult;
  toggle<TValue = unknown>(path: Pointer, value: TValue, options?: SetMembershipOptions<TValue>): SetMembershipResult;
  add<TValue = unknown>(path: Pointer, value: TValue, options?: SetMembershipOptions<TValue>): SetMembershipResult;
  remove<TValue = unknown>(path: Pointer, value: TValue, options?: SetMembershipOptions<TValue>): SetMembershipResult;
}

export function createSetMembership<TDocument>(doc: JSONDocument<TDocument>): SetMembership<TDocument> {
  return {
    canToggle(path, value, options) {
      return plan(doc, path, value, "toggle", options);
    },
    toggle(path, value, options) {
      return apply(doc, path, value, "toggle", options);
    },
    add(path, value, options) {
      return apply(doc, path, value, "add", options);
    },
    remove(path, value, options) {
      return apply(doc, path, value, "remove", options);
    },
  };
}

type Mode = "toggle" | "add" | "remove";

export function plan<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  value: TValue,
  mode: Mode,
  options?: SetMembershipOptions<TValue>,
): SetMembershipResult {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `set-membership path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `set-membership path is not an array: ${path}`, path);
  }
  const items = read.value as TValue[];
  const keyOf = options?.keyOf;

  let targetKey: unknown;
  try {
    targetKey = keyOf ? keyOf(value) : value;
  } catch (cause) {
    return error("key_failed", cause instanceof Error ? cause.message : "set-membership keyOf threw.", path);
  }
  const fingerprint = JSON.stringify(targetKey ?? null);

  let present = false;
  const keptForRemoval: TValue[] = [];
  for (const item of items) {
    let key: unknown;
    try {
      key = keyOf ? keyOf(item) : item;
    } catch (cause) {
      return error("key_failed", cause instanceof Error ? cause.message : "set-membership keyOf threw.", path);
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
  options?: SetMembershipOptions<TValue>,
): SetMembershipResult {
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
): SetMembershipError {
  const result: SetMembershipError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `set-membership patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): SetMembershipError {
  const result: SetMembershipError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `set-membership patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: SetMembershipErrorCode, reason: string, pointer?: Pointer): SetMembershipError {
  const result: SetMembershipError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
