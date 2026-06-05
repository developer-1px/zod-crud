import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { FillBlanksError, FillBlanksErrorCode, FillBlanksOptions, FillBlanksResult, FillBlanksValue } from "./types.js";

export function canFillBlanks<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  value: FillBlanksValue<TValue>,
  options?: FillBlanksOptions,
): FillBlanksResult {
  if (targets.length === 0) {
    return error("empty_targets", "fill-blanks requires at least one target pointer.");
  }
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }
  const isEmpty =
    options?.isEmpty ??
    ((current: unknown) =>
      current === null ||
      current === undefined ||
      current === "" ||
      (Array.isArray(current) && current.length === 0));

  const pointers: Pointer[] = [];
  const operations: JSONPatchOperation[] = [];
  let filled = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index] as Pointer;
    const writePointer = field === "" ? target : target + field;
    pointers.push(writePointer);

    const read = doc.at(writePointer);
    if (!read.ok) {
      return error(read.code, read.reason ?? `fill-blanks target not found: ${writePointer}`, read.pointer);
    }
    if (!isEmpty(read.value)) continue;

    let next: TValue;
    try {
      next = "value" in value ? value.value : value.compute(writePointer, index);
    } catch (cause) {
      return error("value_failed", cause instanceof Error ? cause.message : "fill-blanks compute threw.", writePointer);
    }

    if (JSON.stringify(read.value) !== JSON.stringify(next)) {
      operations.push({ op: "replace", path: writePointer, value: cloneJson(next) });
      filled += 1;
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? "fill-blanks patch rejected",
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    pointers,
    count: targets.length,
    filled,
    changed: operations.length > 0,
    operations,
    selectionAfter: [...targets],
  };
}

function error(code: FillBlanksErrorCode, reason: string, pointer?: Pointer): FillBlanksError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
