import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type SplitTextErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface SplitTextError {
  ok: false;
  code: SplitTextErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SplitTextOptions {
  /** Delimiter to split on. Default `","`. */
  delimiter?: string | RegExp;
  /** Trim each part. Default `true`. */
  trim?: boolean;
  /** Drop empty parts (after trimming). Default `true`. */
  dropEmpty?: boolean;
  /** Drop duplicate parts, keeping first. Default `false`. */
  dedupe?: boolean;
  /** Append parts to the existing array instead of replacing it. Default `false`. */
  append?: boolean;
}

export interface SplitTextChange {
  ok: true;
  path: Pointer;
  /** The parsed parts written (in order). */
  parts: ReadonlyArray<string>;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SplitTextResult = SplitTextChange | SplitTextError;

export interface SplitText<TDocument> {
  canSplit(path: Pointer, text: string, options?: SplitTextOptions): SplitTextResult;
  split(path: Pointer, text: string, options?: SplitTextOptions): SplitTextResult;
}

export function createSplitText<TDocument>(doc: JSONDocument<TDocument>): SplitText<TDocument> {
  return {
    canSplit: (path, text, options) => canSplit(doc, path, text, options),
    split: (path, text, options) => split(doc, path, text, options),
  };
}

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

export function split<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  text: string,
  options?: SplitTextOptions,
): SplitTextResult {
  const change = canSplit(doc, path, text, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `split-text patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
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
