import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type GenerateSlugErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "source_not_string"
  | "patch_rejected"
  | "patch_failed";

export interface GenerateSlugError {
  ok: false;
  code: GenerateSlugErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface GenerateSlugOptions {
  /** Separator between words. Default `"-"`. */
  separator?: string;
  /** Lowercase the result. Default `true`. */
  lower?: boolean;
  /** Max length of the slug (trimmed at a separator boundary). */
  maxLength?: number;
}

export interface GenerateSlugChange {
  ok: true;
  /** Pointer the slug was written to. */
  target: Pointer;
  slug: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type GenerateSlugResult = GenerateSlugChange | GenerateSlugError;

export interface GenerateSlug<TDocument> {
  canGenerateSlug(source: Pointer, target: Pointer, options?: GenerateSlugOptions): GenerateSlugResult;
  generateSlug(source: Pointer, target: Pointer, options?: GenerateSlugOptions): GenerateSlugResult;
}

export function createGenerateSlug<TDocument>(doc: JSONDocument<TDocument>): GenerateSlug<TDocument> {
  return {
    canGenerateSlug: (source, target, options) => canGenerateSlug(doc, source, target, options),
    generateSlug: (source, target, options) => generateSlug(doc, source, target, options),
  };
}

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
    if (!capability.ok) return capabilityError(target, capability);
  }

  return { ok: true, target, slug, changed, operations };
}

export function generateSlug<TDocument>(
  doc: JSONDocument<TDocument>,
  source: Pointer,
  target: Pointer,
  options?: GenerateSlugOptions,
): GenerateSlugResult {
  const change = canGenerateSlug(doc, source, target, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(target, patched);
  return change;
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

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): GenerateSlugError {
  const result: GenerateSlugError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `generate-slug patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): GenerateSlugError {
  const result: GenerateSlugError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `generate-slug patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: GenerateSlugErrorCode, reason: string, pointer?: Pointer): GenerateSlugError {
  const result: GenerateSlugError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
