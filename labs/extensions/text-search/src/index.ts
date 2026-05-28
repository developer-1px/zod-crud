import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type TextSearchErrorCode =
  | "empty_search"
  | "invalid_pointer"
  | "path_not_found"
  | "patch_rejected"
  | "patch_failed";

export interface TextSearchError {
  ok: false;
  code: TextSearchErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface TextSearchOptions {
  root?: Pointer;
  caseSensitive?: boolean;
}

export interface TextMatchRange {
  start: number;
  end: number;
  text: string;
}

export interface TextSearchMatch {
  pointer: Pointer;
  value: string;
  ranges: ReadonlyArray<TextMatchRange>;
}

export interface TextSearchSnapshot {
  ok: true;
  search: string;
  root: Pointer;
  caseSensitive: boolean;
  count: number;
  matches: ReadonlyArray<TextSearchMatch>;
}

export interface TextReplaceChange {
  ok: true;
  search: string;
  replacement: string;
  root: Pointer;
  caseSensitive: boolean;
  count: number;
  matches: ReadonlyArray<TextSearchMatch>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type TextSearchResult = TextSearchSnapshot | TextSearchError;
export type TextReplaceChangeResult = TextReplaceChange | TextSearchError;
export type TextReplaceResult = TextReplaceChange | TextSearchError;

export interface TextSearch<TDocument> {
  find(search: string, options?: TextSearchOptions): TextSearchResult;
  canReplaceAll(search: string, replacement: string, options?: TextSearchOptions): TextReplaceChangeResult;
  replaceAll(search: string, replacement: string, options?: TextSearchOptions): TextReplaceResult;
}

interface NormalizedTextSearchOptions {
  root: Pointer;
  caseSensitive: boolean;
}

export function createTextSearch<TDocument>(
  doc: JSONDocument<TDocument>,
): TextSearch<TDocument> {
  return {
    find(search, options) {
      return findText(doc, search, options);
    },
    canReplaceAll(search, replacement, options) {
      return canReplaceAllText(doc, search, replacement, options);
    },
    replaceAll(search, replacement, options) {
      return replaceAllText(doc, search, replacement, options);
    },
  };
}

export function findText<TDocument>(
  doc: JSONDocument<TDocument>,
  search: string,
  options: TextSearchOptions = {},
): TextSearchResult {
  const normalized = normalizeSearch(search, options);
  if (!normalized.ok) return normalized;

  const matches: TextSearchMatch[] = [];
  const walked = walkText(doc, normalized.options.root, (pointer, value) => {
    const ranges = findRanges(value, search, normalized.options.caseSensitive);
    if (ranges.length === 0) return;
    matches.push({
      pointer,
      value,
      ranges,
    });
  });
  if (!walked.ok) return walked;

  return {
    ok: true,
    search,
    root: normalized.options.root,
    caseSensitive: normalized.options.caseSensitive,
    count: countRanges(matches),
    matches: copyMatches(matches),
  };
}

export function canReplaceAllText<TDocument>(
  doc: JSONDocument<TDocument>,
  search: string,
  replacement: string,
  options: TextSearchOptions = {},
): TextReplaceChangeResult {
  const found = findText(doc, search, options);
  if (!found.ok) return found;

  const operations: JSONPatchOperation[] = [];
  for (const match of found.matches) {
    const value = replaceOccurrences(match.value, search, replacement, found.caseSensitive);
    if (value === match.value) continue;
    operations.push({
      op: "replace",
      path: match.pointer,
      value,
    });
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(found.root, capability);
  }

  return {
    ok: true,
    search,
    replacement,
    root: found.root,
    caseSensitive: found.caseSensitive,
    count: found.count,
    matches: copyMatches(found.matches),
    operations,
  };
}

export function replaceAllText<TDocument>(
  doc: JSONDocument<TDocument>,
  search: string,
  replacement: string,
  options: TextSearchOptions = {},
): TextReplaceResult {
  const change = canReplaceAllText(doc, search, replacement, options);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;

  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.root, patched);
  return change;
}

function walkText<TDocument>(
  doc: JSONDocument<TDocument>,
  root: Pointer,
  visit: (pointer: Pointer, value: string) => void,
): { ok: true } | TextSearchError {
  const read = doc.at(root);
  if (!read.ok) {
    return textSearchError(read.code, read.reason ?? `path not found: ${root}`, read.pointer);
  }

  if (typeof read.value === "string") {
    visit(read.path, read.value);
  }

  const entries = doc.entries(root);
  if (!entries.ok) {
    return textSearchError(entries.code, entries.reason ?? `path not found: ${root}`, entries.pointer);
  }

  for (const entry of entries.entries) {
    const walked = walkText(doc, entry.path, visit);
    if (!walked.ok) return walked;
  }

  return { ok: true };
}

function normalizeSearch(
  search: string,
  options: TextSearchOptions,
): { ok: true; options: NormalizedTextSearchOptions } | TextSearchError {
  if (search.length === 0) {
    return textSearchError("empty_search", "search text must not be empty", options.root);
  }
  return {
    ok: true,
    options: {
      root: options.root ?? "",
      caseSensitive: options.caseSensitive === true,
    },
  };
}

function findRanges(
  value: string,
  search: string,
  caseSensitive: boolean,
): TextMatchRange[] {
  const haystack = caseSensitive ? value : value.toLocaleLowerCase();
  const needle = caseSensitive ? search : search.toLocaleLowerCase();
  const ranges: TextMatchRange[] = [];
  let start = 0;
  while (start <= haystack.length) {
    const index = haystack.indexOf(needle, start);
    if (index < 0) break;
    const end = index + search.length;
    ranges.push({
      start: index,
      end,
      text: value.slice(index, end),
    });
    start = end;
  }
  return ranges;
}

function replaceOccurrences(
  value: string,
  search: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  const ranges = findRanges(value, search, caseSensitive);
  if (ranges.length === 0) return value;

  let next = "";
  let cursor = 0;
  for (const range of ranges) {
    next += value.slice(cursor, range.start);
    next += replacement;
    cursor = range.end;
  }
  return next + value.slice(cursor);
}

function countRanges(matches: ReadonlyArray<TextSearchMatch>): number {
  return matches.reduce((count, match) => count + match.ranges.length, 0);
}

function copyMatches(matches: ReadonlyArray<TextSearchMatch>): TextSearchMatch[] {
  return matches.map((match) => ({
    pointer: match.pointer,
    value: match.value,
    ranges: match.ranges.map((range) => ({ ...range })),
  }));
}

function capabilityError(
  root: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): TextSearchError {
  const error: TextSearchError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `text replacement patch rejected for ${root}`,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function patchError(
  root: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): TextSearchError {
  const error: TextSearchError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `text replacement patch failed for ${root}`,
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function textSearchError(
  code: TextSearchErrorCode,
  reason: string,
  pointer?: Pointer,
): TextSearchError {
  const error: TextSearchError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}
