import type {
  JSONDocument,
  Pointer,
} from "zod-crud";

import {
  searchReplaceError,
} from "./errors.js";
import type {
  NormalizedSearchReplaceOptions,
  SearchReplaceError,
  SearchReplaceMatch,
  SearchReplaceOptions,
  SearchReplaceResult,
  TextMatchRange,
} from "./types.js";

export function findText<TDocument>(
  doc: JSONDocument<TDocument>,
  search: string,
  options: SearchReplaceOptions = {},
): SearchReplaceResult {
  const normalized = normalizeSearch(search, options);
  if (!normalized.ok) return normalized;

  const matches: SearchReplaceMatch[] = [];
  const include = normalized.options.include;
  const walked = walkText(doc, normalized.options.root, (pointer, value) => {
    if (include !== undefined && !include({ pointer, value })) return;
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
    count: matches.reduce((count, match) => count + match.ranges.length, 0),
    matches: copyMatches(matches),
  };
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
  const normalized: NormalizedSearchReplaceOptions = {
    root: options.root ?? "",
    caseSensitive: options.caseSensitive === true,
  };
  if (options.include !== undefined) normalized.include = options.include;
  return {
    ok: true,
    options: normalized,
  };
}

export function findRanges(
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

export function replaceOccurrences(
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

export function copyMatches(matches: ReadonlyArray<SearchReplaceMatch>): SearchReplaceMatch[] {
  return matches.map((match) => ({
    pointer: match.pointer,
    value: match.value,
    ranges: match.ranges.map((range) => ({ ...range })),
  }));
}
