import type {
  JSONDocument,
  JSONPatchOperation,
} from "zod-crud";

import { previewPatch } from "./preview.js";
import type {
  PatchPreview,
  PatchPreviewOptions,
  PatchPreviewSchema,
} from "./types.js";

export function createPatchPreview<T>(
  schema: PatchPreviewSchema,
  doc: JSONDocument<T>,
  options: PatchPreviewOptions = {},
): PatchPreview<T> {
  return {
    canPreview: (operations: ReadonlyArray<JSONPatchOperation>) => doc.canPatch(operations),
    preview: (operations: ReadonlyArray<JSONPatchOperation>) => previewPatch(schema, doc, operations, options),
  };
}
