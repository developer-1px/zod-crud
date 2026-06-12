import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { JoinTextError, JoinTextErrorCode, JoinTextOptions, JoinTextResult } from "./types.js";

export function canJoin<TDocument>(
  doc: JSONDocument<TDocument>,
  source: Pointer,
  target: Pointer,
  options?: JoinTextOptions,
): JoinTextResult {
  const read = doc.at(source);
  if (!read.ok) {
    return error(read.code, read.reason ?? `join-text source not found: ${source}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("source_not_array", `join-text source is not an array: ${source}`, source);
  }
  const items = read.value as unknown[];

  const separator = options?.separator ?? ", ";
  const map =
    options?.map ?? ((item: unknown) => (typeof item === "string" ? item : JSON.stringify(item ?? "")));
  let parts: string[];
  try {
    parts = items.map((item, index) => map(item, index));
  } catch (cause) {
    return error("map_failed", cause instanceof Error ? cause.message : "join-text map threw.", source);
  }
  if (options?.dropEmpty) parts = parts.filter((part) => part.length > 0);
  const value = parts.join(separator);

  const targetRead = doc.at(target);
  if (!targetRead.ok) {
    return error(targetRead.code, targetRead.reason ?? `join-text target not found: ${target}`, targetRead.pointer);
  }

  const changed = targetRead.value !== value;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: target, value }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `join-text patch rejected at ${target}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, source, target, value, changed, operations };
}

function error(code: JoinTextErrorCode, reason: string, pointer?: Pointer): JoinTextError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
