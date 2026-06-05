import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { SplitTextError, SplitTextErrorCode, SplitTextOptions, SplitTextResult } from "./types.js";

export function canSplit<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  text: string,
  options?: SplitTextOptions,
): SplitTextResult {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `split-text path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `split-text path is not an array: ${path}`, path);
  }
  const existing = read.value as unknown[];

  const parts = parse(text, options);
  const next = options?.append ? [...existing, ...parts] : parts;

  const changed = JSON.stringify(existing) !== JSON.stringify(next);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path, value: cloneJson(next) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `split-text patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, path, parts, changed, operations };
}

function parse(text: string, options?: SplitTextOptions): string[] {
  const delimiter = options?.delimiter ?? ",";
  const trim = options?.trim ?? true;
  const dropEmpty = options?.dropEmpty ?? true;

  let parts = text.split(delimiter as string & RegExp);
  if (trim) parts = parts.map((part) => part.trim());
  if (dropEmpty) parts = parts.filter((part) => part.length > 0);
  if (options?.dedupe) parts = [...new Set(parts)];
  return parts;
}

function error(code: SplitTextErrorCode, reason: string, pointer?: Pointer): SplitTextError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
