import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type SearchReplaceErrorCode =
  | "empty_search"
  | "invalid_pointer"
  | "path_not_found"
  | "patch_rejected"
  | "patch_failed";

export interface SearchReplaceError {
  ok: false;
  code: SearchReplaceErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SearchReplaceOptions {
  root?: Pointer;
  caseSensitive?: boolean;
}

export interface TextMatchRange {
  start: number;
  end: number;
  text: string;
}

export interface SearchReplaceMatch {
  pointer: Pointer;
  value: string;
  ranges: ReadonlyArray<TextMatchRange>;
}

export interface SearchReplaceSnapshot {
  ok: true;
  search: string;
  root: Pointer;
  caseSensitive: boolean;
  count: number;
  matches: ReadonlyArray<SearchReplaceMatch>;
}

export interface SearchReplaceChange {
  ok: true;
  search: string;
  replacement: string;
  root: Pointer;
  caseSensitive: boolean;
  count: number;
  matches: ReadonlyArray<SearchReplaceMatch>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SearchReplaceResult = SearchReplaceSnapshot | SearchReplaceError;
export type SearchReplaceChangeResult = SearchReplaceChange | SearchReplaceError;
export type SearchReplaceApplyResult = SearchReplaceChange | SearchReplaceError;

export interface SearchReplace<TDocument> {
  find(search: string, options?: SearchReplaceOptions): SearchReplaceResult;
  canReplaceAll(search: string, replacement: string, options?: SearchReplaceOptions): SearchReplaceChangeResult;
  replaceAll(search: string, replacement: string, options?: SearchReplaceOptions): SearchReplaceApplyResult;
}

interface NormalizedSearchReplaceOptions {
  root: Pointer;
  caseSensitive: boolean;
}

export function createSearchReplace<TDocument>(
  doc: JSONDocument<TDocument>,
): SearchReplace<TDocument> {
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
  options: SearchReplaceOptions = {},
): SearchReplaceResult {
  const normalized = normalizeSearch(search, options);
  if (!normalized.ok) return normalized;

  const matches: SearchReplaceMatch[] = [];
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
  options: SearchReplaceOptions = {},
): SearchReplaceChangeResult {
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
  options: SearchReplaceOptions = {},
): SearchReplaceApplyResult {
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
): { ok: true } | SearchReplaceError {
  const read = doc.at(root);
  if (!read.ok) {
    return searchReplaceError(read.code, read.reason ?? `path not found: ${root}`, read.pointer);
  }

  if (typeof read.value === "string") {
    visit(read.path, read.value);
  }

  const entries = doc.entries(root);
  if (!entries.ok) {
    return searchReplaceError(entries.code, entries.reason ?? `path not found: ${root}`, entries.pointer);
  }

  for (const entry of entries.entries) {
    const walked = walkText(doc, entry.path, visit);
    if (!walked.ok) return walked;
  }

  return { ok: true };
}

function normalizeSearch(
  search: string,
  options: SearchReplaceOptions,
): { ok: true; options: NormalizedSearchReplaceOptions } | SearchReplaceError {
  if (search.length === 0) {
    return searchReplaceError("empty_search", "search text must not be empty", options.root);
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

function countRanges(matches: ReadonlyArray<SearchReplaceMatch>): number {
  return matches.reduce((count, match) => count + match.ranges.length, 0);
}

function copyMatches(matches: ReadonlyArray<SearchReplaceMatch>): SearchReplaceMatch[] {
  return matches.map((match) => ({
    pointer: match.pointer,
    value: match.value,
    ranges: match.ranges.map((range) => ({ ...range })),
  }));
}

function capabilityError(
  root: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): SearchReplaceError {
  const error: SearchReplaceError = {
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
): SearchReplaceError {
  const error: SearchReplaceError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `text replacement patch failed for ${root}`,
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function searchReplaceError(
  code: SearchReplaceErrorCode,
  reason: string,
  pointer?: Pointer,
): SearchReplaceError {
  const error: SearchReplaceError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}
