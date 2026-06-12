import type {
  JSONDocument,
  JSONPatchOperation,
} from "@interactive-os/json-document";

import {
  capabilityError,
  patchError,
} from "./errors.js";
import {
  copyMatches,
  findText,
  replaceOccurrences,
} from "./find.js";
import type {
  SearchReplaceApplyResult,
  SearchReplaceChangeResult,
  SearchReplaceOptions,
} from "./types.js";

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
