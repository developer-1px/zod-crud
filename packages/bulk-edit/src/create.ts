import type {
  JSONChangeMetadata,
  JSONDocument,
} from "@interactive-os/json-document";

import {
  canDeleteAll,
  deleteAll,
} from "./deleteAll.js";
import {
  canReplaceAll,
  replaceAll,
} from "./replaceAll.js";
import type {
  BulkEdit,
  BulkEditChangeResult,
  BulkEditResult,
} from "./types.js";

export function createBulkEdit<TDocument>(
  doc: JSONDocument<TDocument>,
): BulkEdit<TDocument> {
  return {
    canReplaceAll: (jsonPath: string, valueOrMapper: unknown): BulkEditChangeResult => canReplaceAll(doc, jsonPath, valueOrMapper),
    replaceAll: (jsonPath: string, valueOrMapper: unknown, metadata?: JSONChangeMetadata): BulkEditResult => replaceAll(doc, jsonPath, valueOrMapper, metadata),
    canDeleteAll: (jsonPath) => canDeleteAll(doc, jsonPath),
    deleteAll: (jsonPath, metadata) => deleteAll(doc, jsonPath, metadata),
  };
}
