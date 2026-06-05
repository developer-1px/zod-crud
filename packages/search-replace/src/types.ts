import type {
  JSONCapabilityResult,
  JSONPatchOperation,
  JSONResult,
  Pointer,
} from "zod-crud";

export type SearchReplaceErrorCode =
  | "empty_search"
  | "invalid_pointer"
  | "invalid_match"
  | "not_text"
  | "path_not_found"
  | "patch_rejected"
  | "patch_failed"
  | "stale_match";

export interface SearchReplaceError {
  ok: false;
  code: SearchReplaceErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult | JSONCapabilityResult, { ok: false }>;
}

export interface SearchReplaceTextTarget {
  pointer: Pointer;
  value: string;
}

export type SearchReplaceTargetFilter = (target: SearchReplaceTextTarget) => boolean;

export interface SearchReplaceOptions {
  root?: Pointer;
  caseSensitive?: boolean;
  include?: SearchReplaceTargetFilter;
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

export interface SearchReplaceMatchTarget {
  pointer: Pointer;
  range: TextMatchRange;
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

export interface SearchReplaceMatchChange {
  ok: true;
  pointer: Pointer;
  range: TextMatchRange;
  replacement: string;
  currentValue: string;
  nextValue: string;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SearchReplaceResult = SearchReplaceSnapshot | SearchReplaceError;
export type SearchReplaceMatchChangeResult = SearchReplaceMatchChange | SearchReplaceError;
export type SearchReplaceMatchApplyResult = SearchReplaceMatchChangeResult;
export type SearchReplaceChangeResult = SearchReplaceChange | SearchReplaceError;
export type SearchReplaceApplyResult = SearchReplaceChangeResult;

export interface SearchReplace<TDocument> {
  find(search: string, options?: SearchReplaceOptions): SearchReplaceResult;
  canReplaceMatch(target: SearchReplaceMatchTarget, replacement: string): SearchReplaceMatchChangeResult;
  replaceMatch(target: SearchReplaceMatchTarget, replacement: string): SearchReplaceMatchApplyResult;
  canReplaceAll(search: string, replacement: string, options?: SearchReplaceOptions): SearchReplaceChangeResult;
  replaceAll(search: string, replacement: string, options?: SearchReplaceOptions): SearchReplaceApplyResult;
}

export interface NormalizedSearchReplaceOptions {
  root: Pointer;
  caseSensitive: boolean;
  include?: SearchReplaceTargetFilter;
}
