import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  findText,
} from "./find.js";
import {
  canReplaceTextMatch,
  replaceTextMatch,
} from "./match.js";
import {
  canReplaceAllText,
  replaceAllText,
} from "./replaceAll.js";
import type {
  SearchReplace,
} from "./types.js";

export function createSearchReplace<TDocument>(
  doc: JSONDocument<TDocument>,
): SearchReplace<TDocument> {
  return {
    find: (search, options) => findText(doc, search, options),
    canReplaceMatch: (target, replacement) => canReplaceTextMatch(doc, target, replacement),
    replaceMatch: (target, replacement) => replaceTextMatch(doc, target, replacement),
    canReplaceAll: (search, replacement, options) => canReplaceAllText(doc, search, replacement, options),
    replaceAll: (search, replacement, options) => replaceAllText(doc, search, replacement, options),
  };
}
