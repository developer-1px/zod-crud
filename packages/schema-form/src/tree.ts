import type {
  JSONDocument,
  Pointer,
} from "@interactive-os/json-document";

import {
  createSchemaForm,
} from "./create.js";
import type {
  SchemaFormField,
  SchemaFormTreeField,
  SchemaFormTreeResult,
} from "./types.js";

export function createSchemaFormTree<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer = "",
): SchemaFormTreeResult {
  const form = createSchemaForm(doc, rootPointer);
  if (!form.ok) return form;

  return {
    ok: true,
    path: form.path,
    kind: form.kind,
    fields: form.fields.map((field) => createTreeField(doc, field)),
  };
}

function createTreeField<T>(
  doc: JSONDocument<T>,
  field: SchemaFormField,
): SchemaFormTreeField {
  const childForm = createSchemaForm(doc, field.path);
  if (!childForm.ok) return field;

  return {
    ...field,
    containerKind: childForm.kind,
    fields: childForm.fields.map((child) => createTreeField(doc, child)),
  };
}
