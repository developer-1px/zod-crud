import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { BatchUpdateError, BatchUpdateErrorCode, BatchUpdateOptions, BatchUpdateResult, BatchUpdateValue } from "./types.js";

export function canBatchUpdate<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: BatchUpdateValue<TValue>,
  options?: BatchUpdateOptions,
): BatchUpdateResult {
  if (targets.length === 0) {
    return error("empty_targets", "batch-update requires at least one target pointer.");
  }
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }

  const pointers: Pointer[] = [];
  const operations: JSONPatchOperation[] = [];
  let changed = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index] as Pointer;
    const writePointer = field === "" ? target : target + field;
    pointers.push(writePointer);

    const read = doc.at(writePointer);
    if (!read.ok) {
      return error(read.code, read.reason ?? `batch-update target not found: ${writePointer}`, read.pointer);
    }

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(read.value, writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "batch-update compute threw.", writePointer);
    }

    if (JSON.stringify(read.value) !== JSON.stringify(next)) {
      operations.push({ op: "replace", path: writePointer, value: cloneJson(next) });
      changed += 1;
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? "batch-update patch rejected",
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    pointers,
    count: targets.length,
    changed,
    operations,
    selectionAfter: [...targets],
  };
}

function error(code: BatchUpdateErrorCode, reason: string, pointer?: Pointer): BatchUpdateError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
