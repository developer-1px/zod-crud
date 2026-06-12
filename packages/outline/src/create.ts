import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  canDemoteOutline,
  canPromoteOutline,
  demoteOutline,
  promoteOutline,
} from "./move.js";
import {
  normalizeStructureOptions,
} from "./options.js";
import {
  readOutline,
} from "./read.js";
import type {
  Outline,
  OutlineStructureOptions,
} from "./types.js";

export function createOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  options: OutlineStructureOptions = {},
): Outline<TDocument> {
  const structureOptions = normalizeStructureOptions(options);

  return {
    tree: (rootPointer = "", treeOptions = {}) => readOutline(doc, rootPointer, treeOptions),
    canDemote: (source) => canDemoteOutline(doc, source, structureOptions),
    demote: (source) => demoteOutline(doc, source, structureOptions),
    canPromote: (source) => canPromoteOutline(doc, source, structureOptions),
    promote: (source) => promoteOutline(doc, source, structureOptions),
  };
}
