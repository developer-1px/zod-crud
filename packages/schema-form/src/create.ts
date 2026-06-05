import type {
  JSONDocument,
  Pointer,
} from "zod-crud";

import {
  readSchemaFormRoot,
} from "./container.js";
import {
  createSchemaFormField,
} from "./field.js";
import type {
  SchemaFormResult,
} from "./types.js";

export function createSchemaForm<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer = "",
): SchemaFormResult {
  const root = readSchemaFormRoot(doc, rootPointer);
  if (!root.ok) return root;

  return {
    ok: true,
    path: root.path,
    kind: root.kind,
    fields: root.entries.map((entry) => createSchemaFormField(doc, entry)),
  };
}
