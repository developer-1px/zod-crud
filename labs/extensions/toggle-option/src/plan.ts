import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { MembershipAction, Mode, ToggleOptionError, ToggleOptionErrorCode, ToggleOptionOptions, ToggleOptionResult } from "./types.js";

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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `toggle-option patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
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

function error(code: ToggleOptionErrorCode, reason: string, pointer?: Pointer): ToggleOptionError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
