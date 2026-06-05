import type {
  JSONDocument,
} from "zod-crud";

import {
  valueKind,
} from "./container.js";
import type {
  SchemaFormEntry,
  SchemaFormField,
} from "./types.js";

export function createSchemaFormField<T>(
  doc: JSONDocument<T>,
  entry: SchemaFormEntry,
): SchemaFormField {
  const described = doc.schema.describe(entry.path);
  const kind = described.ok ? described.description.kind : valueKind(entry.value);
  const field: SchemaFormField = {
    key: entry.key,
    path: entry.path,
    value: cloneJson(entry.value),
    kind,
    canReplace: doc.canReplace(entry.path, entry.value),
    canSet: (value) => doc.canReplace(entry.path, value),
    set: (value) => doc.replace(entry.path, value),
  };
  if (described.ok) field.description = described.description;
  return field;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}
