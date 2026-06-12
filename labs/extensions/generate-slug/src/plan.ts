import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { GenerateSlugError, GenerateSlugErrorCode, GenerateSlugOptions, GenerateSlugResult } from "./types.js";

export function canGenerateSlug<TDocument>(
  doc: JSONDocument<TDocument>,
  source: Pointer,
  target: Pointer,
  options?: GenerateSlugOptions,
): GenerateSlugResult {
  const read = doc.at(source);
  if (!read.ok) {
    return error(read.code, read.reason ?? `generate-slug source not found: ${source}`, read.pointer);
  }
  if (typeof read.value !== "string") {
    return error("source_not_string", `generate-slug source is not a string: ${source}`, source);
  }

  const slug = toSlug(read.value, options);

  const targetRead = doc.at(target);
  if (!targetRead.ok) {
    return error(targetRead.code, targetRead.reason ?? `generate-slug target not found: ${target}`, targetRead.pointer);
  }

  const changed = targetRead.value !== slug;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: target, value: slug }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `generate-slug patch rejected at ${target}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, target, slug, changed, operations };
}

function toSlug(input: string, options?: GenerateSlugOptions): string {
  const separator = options?.separator ?? "-";
  const lower = options?.lower ?? true;

  let text = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // strip diacritics
  if (lower) text = text.toLowerCase();
  // non-alphanumeric runs -> separator
  let slug = text
    .replace(/[^a-zA-Z0-9]+/g, separator)
    .replace(new RegExp(`${escapeRegExp(separator)}{2,}`, "g"), separator);
  // trim leading/trailing separators
  slug = trimSeparator(slug, separator);

  if (options?.maxLength !== undefined && slug.length > options.maxLength) {
    slug = slug.slice(0, options.maxLength);
    slug = trimSeparator(slug, separator);
  }
  return slug;
}

function trimSeparator(text: string, separator: string): string {
  if (separator.length === 0) return text;
  let start = 0;
  let end = text.length;
  while (text.startsWith(separator, start)) start += separator.length;
  while (end - separator.length >= start && text.startsWith(separator, end - separator.length)) {
    end -= separator.length;
  }
  return text.slice(start, end);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function error(code: GenerateSlugErrorCode, reason: string, pointer?: Pointer): GenerateSlugError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
