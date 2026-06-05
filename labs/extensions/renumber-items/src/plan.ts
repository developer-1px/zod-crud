import { appendSegment, type JSONDocument, type JSONPatchOperation, type Pointer } from "zod-crud";
import type { RenumberItemsError, RenumberItemsErrorCode, RenumberItemsOptions, RenumberItemsResult } from "./types.js";

export function canRenumberItems<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: RenumberItemsOptions,
): RenumberItemsResult {
  const field = options?.field ?? "/order";
  if (!field.startsWith("/")) {
    return error("invalid_field", `field must start with '/': ${field}`, field);
  }
  const start = options?.start ?? 0;
  const step = options?.step ?? 1;

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `renumber-items path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `renumber-items path is not an array: ${path}`, path);
  }
  const items = read.value as unknown[];

  const operations: JSONPatchOperation[] = [];
  let changedCount = 0;
  for (let index = 0; index < items.length; index += 1) {
    const writePointer = appendSegment(path, index) + field;
    const next = start + index * step;
    const current = doc.at(writePointer);
    if (!current.ok || current.value !== next) {
      operations.push({ op: "replace", path: writePointer, value: next });
      changedCount += 1;
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `renumber-items patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    path,
    field,
    count: items.length,
    changedCount,
    changed: operations.length > 0,
    operations,
  };
}

function error(code: RenumberItemsErrorCode, reason: string, pointer?: Pointer): RenumberItemsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
