import type {
  SchemaDescription,
  EntryKind,
  JSONCapabilityResult,
  JSONDocument,
  JSONResult,
  Pointer,
  SchemaKind,
} from "zod-crud";

export type SchemaFormContainerKind = "object" | "array" | "record";

export type SchemaFormErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_container";

export interface SchemaFormError {
  ok: false;
  code: SchemaFormErrorCode;
  reason: string;
  pointer: Pointer;
  kind?: EntryKind | SchemaKind;
}

export interface SchemaFormField {
  key: string;
  path: Pointer;
  value: unknown;
  kind: SchemaKind;
  description?: SchemaDescription;
  canReplace: JSONCapabilityResult;
  canSet(value: unknown): JSONCapabilityResult;
  set(value: unknown): JSONResult | Exclude<JSONCapabilityResult, { ok: true }>;
}

export interface SchemaFormTreeField extends SchemaFormField {
  containerKind?: SchemaFormContainerKind;
  fields?: ReadonlyArray<SchemaFormTreeField>;
}

export type SchemaFormResult =
  | {
      ok: true;
      path: Pointer;
      kind: SchemaFormContainerKind;
      fields: ReadonlyArray<SchemaFormField>;
    }
  | SchemaFormError;

export type SchemaFormTreeResult =
  | {
      ok: true;
      path: Pointer;
      kind: SchemaFormContainerKind;
      fields: ReadonlyArray<SchemaFormTreeField>;
    }
  | SchemaFormError;

export function createSchemaForm<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer = "",
): SchemaFormResult {
  const entries = doc.entries(rootPointer);
  if (!entries.ok) {
    return schemaFormError(
      entries.code,
      entries.reason ?? `form root not found: ${rootPointer}`,
      entries.pointer,
    );
  }

  const rootKind = doc.schema.kind(rootPointer);
  const kind = containerKind(entries.kind, rootKind.ok ? rootKind.kind : "unknown");
  if (kind === null) {
    return schemaFormError(
      "not_container",
      `schema form root must be an object, record, or array: ${rootPointer}`,
      rootPointer,
      rootKind.ok ? rootKind.kind : valueKind(readValue(doc, rootPointer)),
    );
  }

  return {
    ok: true,
    path: rootPointer,
    kind,
    fields: entries.entries.map((entry): SchemaFormField => {
      const described = doc.schema.describe(entry.path);
      const kind = described.ok ? described.description.kind : valueKind(entry.value);
      const field: SchemaFormField = {
        key: entry.key,
        path: entry.path,
        value: cloneJson(entry.value),
        kind,
        canReplace: doc.canReplace(entry.path, entry.value),
        canSet(value) {
          return doc.canReplace(entry.path, value);
        },
        set(value) {
          return doc.replace(entry.path, value);
        },
      };
      if (described.ok) field.description = described.description;
      return field;
    }),
  };
}

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

function containerKind(
  entriesKind: EntryKind,
  schemaKind: SchemaKind,
): SchemaFormContainerKind | null {
  if (entriesKind === "object" || entriesKind === "array" || entriesKind === "record") {
    return entriesKind;
  }

  if (schemaKind === "object" || schemaKind === "array" || schemaKind === "record") {
    return schemaKind;
  }

  return null;
}

function valueKind(value: unknown): SchemaKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

function readValue<T>(doc: JSONDocument<T>, path: Pointer): unknown {
  const result = doc.at(path);
  return result.ok ? result.value : undefined;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function schemaFormError(
  code: SchemaFormErrorCode,
  reason: string,
  pointer: Pointer,
  kind?: EntryKind | SchemaKind,
): SchemaFormError {
  const error: SchemaFormError = { ok: false, code, reason, pointer };
  if (kind !== undefined) error.kind = kind;
  return error;
}
